const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const { createServer } = require("http");
const { Server } = require("socket.io");

const app = express();
const port = 80;
const httpServer = createServer(app);


// for getting post request parameters
app.use(express.urlencoded({ extended: true }));
const io = new Server(httpServer);
const users = {};

// session
app.use(session({
    secret: "this is secret key",
    resave: false,
    saveUninitialized: false
}));

// db connection
mongoose.connect('mongodb://localhost/chatzz', {useNewUrlParser: true});

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function(){
    console.log("Database connection successful".toUpperCase());
});

var userSchema = new mongoose.Schema({
    _id: String, // username
    email: {type: String, unique: true, required: true},
    name: String,
    password: String,
});

var connectionSchema = new mongoose.Schema({
    user1: String,
    user2: String,
    connected: Boolean
});
connectionSchema.index({user1: 1, user2: 1}, {unique: true});

var messageSchema = new mongoose.Schema({
    to: String,
    from: String,
    timestamp: Number,
    message: String
});

var User = mongoose.model('User', userSchema);
var Connection = mongoose.model('Connection', connectionSchema);
var Message = mongoose.model('Message', messageSchema);
// *************************************************************************************************

// For serving static files
app.use('/static', express.static('static'));

// VIEW ENGINE STUFF
app.set('view engine', 'ejs'); // set template engine as ejs
app.set('views', path.join(__dirname, 'views')); // set views directory

// Get Requests
app.get("/", (req, res) => {
    if(req.session.username)
        res.redirect("/welcome");
    else
        res.status(200).render('login', {title: "Login"})
});

app.get("/signup", (req, res) => {
    res.status(200).render('signup', {title: "Sign Up"});
});

app.get("/welcome", (req, res) => {
    if(req.session.username)
        res.status(200).render('welcome', {title: "Welcome", username: req.session.username});
    else
        res.redirect("/");
});

app.get("/logout", (req, res) => {
    users[req.session.username] = undefined;
    req.session.destroy();
    res.redirect("/");
});

app.get("/searchName", (req, res) => {
    // Search names by removing those who are already connected or request is sent to them or received from them.
    let name = req.query.name;
    Connection.find(
        {
            $or: [
                {user1: req.session.username},
                {user2: req.session.username}
            ]
        },
        {user1: 1, user2: 1}
    ).then((result) => {
        let arr = [];
        for(r of result)
            if(r.user1 === req.session.username)
                arr.push(r.user2);
            else
                arr.push(r.user1);
        return arr;
    }).then((result) => {
        User.find(
            {
                $and:[
                    {
                        $or: [
                            {name: {$regex: `.*${name}.*`}},
                            {_id: {$regex: `.*${name}.*`}}
                        ]
                    },
                    {_id: {$ne: req.session.username}},
                    {_id: {$nin: result}}
                ]
            },
            {name: 1}
        ).then((results) => {
            res.json(results);
        });
    });
});

app.get("/sendConnectionRequest", (req, res) => {
    let uId = req.query.userId;
    var connection = new Connection({
        user1: req.session.username,
        user2: uId,
        connected: false
    });
    connection.save().then(() => {
        if(users[uId])
            users[uId].emit("receive-request", req.session.username, req.session.name)
        res.send({"msg": "success"});
    }).catch(e => {
        res.send({"msg": "error"});
    });
});

app.get("/getReceivedRequests", (req, res) => {
    Connection.find(
        {user2: req.session.username, connected: false},
        {user1: 1}
    ).then((result) => {
        let arr = [];
        for(obj of result)
            arr.push(obj.user1);
        return arr;
    }).then((result) => {
        User.find(
            {_id: {$in: result}},
            {name: 1}
        ).then(result => res.send(result));
    });
});

app.get("/getSentRequests", (req, res) => {
    Connection.find(
        {user1: req.session.username, connected:false},
        {user2: 1}
    ).then((result) => {
        let arr = [];
        for(obj of result)
            arr.push(obj.user2);
        return arr;
    }).then((result) => {
        User.find(
            {_id: {$in: result}},
            {name: 1}
        ).then(result => res.send(result));
    });
});

app.get("/withdrawRequest", (req, res) => {
    let uId = req.query.user
    Connection.deleteOne(
        {
            user1: req.session.username,
            user2: uId
        }
    ).then(result => {
        if(users[uId])
            users[uId].emit('withdraw-request', req.session.username)
        res.send({})
    }).catch(e => res.send({}));
})

app.get("/acceptRequest", (req, res) => {
    let uId = req.query.user
    Connection.updateOne(
        {
            user1: uId,
            user2: req.session.username
        },
        {$set: {connected: true}}
    ).then(result => {
        if(users[uId])
            users[uId].emit('accept-request', req.session.username, req.session.name);
        res.send({})
    }).catch(e => res.send({}));;
});

app.get("/rejectRequest", (req, res) => {
    let uId = req.query.user
    Connection.deleteOne(
        {
            user1: uId,
            user2: req.session.username
        }
    ).then(result => {
        if(users[uId])
            users[uId].emit('reject-request', req.session.username)
        res.send({})
    }).catch(e => res.send({}));
});

app.get("/getConnections", (req, res) => {
    if(req.session.username){
        Connection.find(
            {
                $and: [
                    {
                        $or: [{user1: req.session.username}, {user2: req.session.username}],
                        connected: true
                    }
                ]
            },
            {user1: 1, user2: 1}
        ).then((result) => {
            let arr = [];
            for(obj of result)
                if(obj.user1===req.session.username)
                    arr.push(obj.user2);
                else
                    arr.push(obj.user1);
            return arr;
        }).then((result) => {
            User.find(
                {_id: {$in: result}},
                {name: 1}
            ).then(result => res.send(result));
        });
    }
});

app.get("/getMessages", (req, res) => {
    if(req.session.username){
        Message.find(
            {$or: [{from: req.session.username}, {to: req.session.username}]}, 
            {_id: false}
        ).then((result) => {
            let obj = {};
            let user;
            let sent;
            for(let i=result.length-1; i>=0; i--){
                if(result[i].from === req.session.username){
                    user = result[i].to;
                    sent = true;
                }
                else{
                    user = result[i].from;
                    sent = false;
                }
                if(!obj[user])
                    obj[user] = [];
                obj[user].push({"sent": sent, "timestamp": result[i].timestamp, "message": result[i].message});
            }
            res.send(obj);
        });
    }
});

// Post Requests
app.post("/signup", (req, res) => {
    if(req.body.password === req.body.password2){
        var user = new User({
            _id: req.body.username,
            email: req.body.email,
            name: req.body.fullname,
            password: req.body.password 
        });
        user.save().then(()=>{
            res.redirect("/");
        }).catch((e)=>{
            res.render('error', {title: "Error", error: "Username / Email already exists"});
        });
    }
    else
        res.render('error', {title: "Error", error: "Passwords does not match"});
});

app.post('/login', (req, res) => {
    User.findOne(req.body).then(user => {
        if(user===null)
            res.render('error', {title: "Error", error: "Incorrect Email / Password"});
        else{
            req.session.username = user._id;
            req.session.name = user.name;
            res.redirect('/');
        }
    });
});

app.post('/sendMessage', (req, res) => {
    if(req.session.username){
        var msg = new Message({
            to: req.body.user,
            from: req.session.username,
            timestamp: Date.now(),
            message: req.body.msg
        });
        msg.save();
        res.send({timestamp: msg.timestamp, message: msg.message, sent: true});
        if(users[msg.to])
            users[msg.to].emit("receive-message", req.session.username, {timestamp: msg.timestamp, message: msg.message, sent: false});
    }
});

// SOCKET
io.on("connection", (socket) => {
    socket.on('user-logged-in', (username) => {
        users[username] = socket;
        socket.emit("user-logged-in", username);
    });
});

// START SERVER
httpServer.listen(port, ()=>{
    console.log(`App started on port ${port}`);
});