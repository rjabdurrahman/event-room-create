const functions = require("firebase-functions");
const admin = require('firebase-admin');
const _ = require('lodash');

admin.initializeApp(functions.config().firestore);
admin.firestore().settings({ timestampsInSnapshots: true });

let initRoomId = 0;
let rooms = {};
let users = [];

function createRoom(...users) {
    let roomId = 'r' + (++initRoomId);
    rooms[roomId] = users.map(x => x.id);
    users.forEach(x => x.usersRoom = roomId);
}

function sameTypeMatching(arr) {
    if (arr.length != 0) {
        if (arr.length == 1) {
            let takernUserB = arr.shift();
            takernUserB.usersRoom = null;
            users.push(takernUserB);
            return;
        }
        else if (arr.length == 3) {
            let u1 = arr.shift();
            let u2 = arr.shift();
            let u3 = arr.shift();
            if(u1.usersSpokenTo.includes(u2.id) || u1.usersSpokenTo.includes(u3.id) || u2.usersSpokenTo.includes(u3.id)) {
                u1.usersRoom = null;
                u2.usersRoom = null;
                u3.usersRoom = null;
            }
            else {
                u1.usersSpokenTo.push(u2.id, u3.id);
                u2.usersSpokenTo.push(u1.id, u3.id);
                u3.usersSpokenTo.push(u1.id, u2.id);
                createRoom(u1, u2, u3);
            }
            users.push(u1, u2, u3);
            return;
        }
        else if (arr.length == 2) {
            arr.sort((a, b) => a.usersSpokenTo.length - b.usersSpokenTo.length);
            let u1 = arr.shift();
            let u2 = arr.shift();
            if (!u1.usersSpokenTo.includes(u2.id)) {
                u1.usersSpokenTo.push(u2.id);
                u2.usersSpokenTo.push(u1.id);
                createRoom(u1, u2);
                users.push(u1, u2);
            }
            else {
                u1.usersRoom = null;
                u2.usersRoom = null;
                users.push(u1, u2);
            }
            return;
        }
        else {
            console.log('called')
            let u1 = arr.shift();
            let u2 = arr.find(x => !x.usersSpokenTo.includes(u1.id));
            _.remove(arr, u2);
            u1.usersSpokenTo.push(u2.id);
            u2.usersSpokenTo.push(u1.id);
            createRoom(u1, u2);
            users.push(u1, u2);
            sameTypeMatching(arr);
        }
    }
}


exports.createEventRooms = functions.https.onRequest(async (req, res) => {
    const snapshot = await admin.firestore().collection('events').doc(req.query.eventId).collection('users').get()
    let eventUsers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    eventUsers.forEach(x => {
        if (!x.usersSpokenTo) x.usersSpokenTo = [];
        x.usersRoom = null;
    });
    var userTypeA = eventUsers.filter(x => x.userType == "A");
    var userTypeB = eventUsers.filter(x => x.userType == "B");
    // Different Type Matching
    while (takenUserA = userTypeA.shift()) {
        let notSpoken = _.difference(userTypeB.map(x => x.id), takenUserA.usersSpokenTo);
        if (notSpoken.length == 0) break;
        let takenNotSpokenBId = notSpoken.shift();
        let takenUserB = userTypeB.find(x => x.id == takenNotSpokenBId);
        _.remove(userTypeB, function (c) {
            return (c.id === takenNotSpokenBId);
        });
        takenUserA.usersSpokenTo.push(takenUserB.id);
        takenUserB.usersSpokenTo.push(takenUserA.id);
        createRoom(takenUserA, takenUserB)
        users.push(takenUserA, takenUserB);
    }
    // Same Type Matching
    sameTypeMatching(userTypeA);
    sameTypeMatching(userTypeB);
    res.send(rooms);
});
