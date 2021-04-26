const functions = require("firebase-functions");
const admin = require('firebase-admin');
const _ = require('lodash');

admin.initializeApp(functions.config().firestore);
admin.firestore().settings({ timestampsInSnapshots: true });

let users = [];

async function createRoom(users, eventId) {
    try {
        await admin.firestore().collection('events').doc(eventId).collection('rooms').add({r: users.map(x => x.id)});
        for (x of users) {
            x.usersRoom = 'roomId';
            let user = JSON.parse(JSON.stringify(x));
            delete user.id;
            await admin.firestore().collection('events').doc(eventId).collection('users').doc(x.id).set(user);
        }
    } catch (err) {
        console.log(err);
    }
}

// Same Type Matching
function sameTypeMatching(usersArr) {
    usersArr.sort((a, b) => b.usersSpokenTo.length - a.usersSpokenTo.length);
    if (usersArr.length != 0) {
        if (usersArr.length == 1) {
            let takernUserB = usersArr.shift();
            takernUserB.usersRoom = null;
            users.push(takernUserB);
            return;
        }
        else if (usersArr.length == 3) {
            let u1 = usersArr.shift();
            let u2 = usersArr.shift();
            let u3 = usersArr.shift();
            if (u1.usersSpokenTo.includes(u2.id) || u1.usersSpokenTo.includes(u3.id) || u2.usersSpokenTo.includes(u3.id)) {
                u1.usersRoom = null;
                u2.usersRoom = null;
                u3.usersRoom = null;
            }
            else {
                u1.usersSpokenTo.push(u2.id, u3.id);
                u2.usersSpokenTo.push(u1.id, u3.id);
                u3.usersSpokenTo.push(u1.id, u2.id);
                createRoom([u1, u2, u3], eventId);
            }
            users.push(u1, u2, u3);
            return;
        }
        else if (usersArr.length == 2) {
            let u1 = usersArr.shift();
            let u2 = usersArr.shift();
            if (!u1.usersSpokenTo.includes(u2.id)) {
                u1.usersSpokenTo.push(u2.id);
                u2.usersSpokenTo.push(u1.id);
                createRoom([u1, u2], eventId);
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
            let u1 = usersArr.shift();
            let u2 = usersArr.find(x => !x.usersSpokenTo.includes(u1.id));
            _.remove(usersArr, u2);
            u1.usersSpokenTo.push(u2.id);
            u2.usersSpokenTo.push(u1.id);
            createRoom([u1, u2], eventId);
            users.push(u1, u2);
            sameTypeMatching(usersArr);
        }
    }
}


exports.createEventRooms = functions.https.onRequest(async (req, res) => {
    let eventId = req.query.eventId;
    const snapshot = await admin.firestore().collection('events').doc(eventId).collection('users').get()
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
        createRoom([takenUserA, takenUserB], eventId)
        users.push(takenUserA, takenUserB);
    }
    // Same Type Matching
    sameTypeMatching(userTypeA);
    sameTypeMatching(userTypeB);
    res.send('done');
});
