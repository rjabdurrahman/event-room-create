const functions = require("firebase-functions");
const admin = require('firebase-admin');
const _ = require('lodash');

admin.initializeApp(functions.config().firestore);
admin.firestore().settings({ timestampsInSnapshots: true });

async function deleteOldRooms(eventId) {
    try {
        await admin.firestore().collection('events').doc(eventId).collection('rooms').listDocuments().then(val => {
            val.map((val) => {
                val.delete()
            })
        });
    } catch (err) {
        console.error(err);
    }
}

async function createRoom(users, eventId) {
    try {
        let roomData = users.reduce(function (result, user, index) {
            result['u' + index] = user.id;
            return result;
        }, {});
        let docRef = await admin.firestore().collection('events').doc(eventId).collection('rooms').add(roomData);
        for (let user of users) {
            user.usersRoom = docRef.id;
            let docId = user.id;
            delete user.id;
            await admin.firestore().collection('events').doc(eventId).collection('users').doc(docId).set(user);
        }
    } catch (err) {
        console.log(err);
    }
}

async function nullUserUpdater(users, eventId) {
    for (let user of users) {
        user.usersRoom = null;
        let docId = user.id;
        delete user.id;
        try {
            await admin.firestore().collection('events').doc(eventId).collection('users').doc(docId).set(user);
        }
        catch (err) {
            console.error(err);
        }
    }
}

// Same Type Matching
async function sameTypeMatching(usersArr, eventId) {
    usersArr.sort((a, b) => b.usersSpokenTo.length - a.usersSpokenTo.length);
    if (usersArr.length != 0) {
        if (usersArr.length == 1) {
            nullUserUpdater([usersArr.shift()], eventId);
            return;
        }
        else if (usersArr.length == 3) {
            let u1 = usersArr.shift();
            let u2 = usersArr.shift();
            let u3 = usersArr.shift();
            let refined = [u1, u2, u3].map(u => u.usersSpokenTo).flat().filter(x => [u1.id, u2.id, u3.id].includes(x));
            // console.log(refined)
            if (refined.length == 6) {
                nullUserUpdater([u1, u2, u3], eventId);
            }
            else {
                u1.usersSpokenTo.push(u2.id, u3.id);
                u2.usersSpokenTo.push(u1.id, u3.id);
                u3.usersSpokenTo.push(u1.id, u2.id);
                u1.usersSpokenTo = _.uniq(u1.usersSpokenTo);
                u2.usersSpokenTo = _.uniq(u2.usersSpokenTo);
                u3.usersSpokenTo = _.uniq(u3.usersSpokenTo);
                createRoom([u1, u2, u3], eventId);
            }
            return;
        }
        else if (usersArr.length == 2) {
            let u1 = usersArr.shift();
            let u2 = usersArr.shift();
            if (!u1.usersSpokenTo.includes(u2.id)) {
                u1.usersSpokenTo.push(u2.id);
                u2.usersSpokenTo.push(u1.id);
                createRoom([u1, u2], eventId);
            }
            else {
                nullUserUpdater([u1, u2], eventId);
            }
            return;
        }
        else {
            // Do something here
            let u1 = usersArr.shift();
            console.log(usersArr)
            console.log(u1);
            let notSpoken = _.difference(usersArr.map(x => x.id), u1.usersSpokenTo);
            if (notSpoken.length == 0) {
                nullUserUpdater([u1], eventId);
            }
            else {
                _.remove(usersArr, u2);
                u1.usersSpokenTo.push(u2.id);
                u2.usersSpokenTo.push(u1.id);
                createRoom([u1, u2], eventId);
            }
            sameTypeMatching(usersArr);
        }
    }
    else return;
}


exports.createEventRooms = functions.https.onRequest(async (req, res) => {
    let eventId = req.query.eventId;
    deleteOldRooms(eventId);
    const snapshot = await admin.firestore().collection('events').doc(eventId).collection('users').where("userLeft", "==", false).get();
    let eventUsers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    eventUsers.forEach(x => {
        if (!x.usersSpokenTo) x.usersSpokenTo = [];
        x.usersRoom = null;
    });
    let userTypeA = eventUsers.filter(x => x.userType == "A");
    let userTypeB = eventUsers.filter(x => x.userType == "B");
    // Different Type Matching
    let notSpokenAs = [];
    while (takenUserA = userTypeA.shift()) {
        let notSpoken = _.difference(userTypeB.map(x => x.id), takenUserA.usersSpokenTo);
        if (notSpoken.length == 0) {
            notSpokenAs.push(takenUserA);
            continue;
        }
        let takenNotSpokenBId = notSpoken.shift();
        let takenUserB = userTypeB.find(x => x.id == takenNotSpokenBId);
        _.remove(userTypeB, function (c) {
            return (c.id === takenNotSpokenBId);
        });
        takenUserA.usersSpokenTo.push(takenUserB.id);
        takenUserB.usersSpokenTo.push(takenUserA.id);
        createRoom([takenUserA, takenUserB], eventId)
    }
    userTypeA = [...userTypeA, ...notSpokenAs]
    // Same Type Matching
    if (userTypeA.length) sameTypeMatching(userTypeA, eventId);
    if (userTypeB.length) sameTypeMatching(userTypeB, eventId);
    res.send('Rooms Created Successfully!');
});
exports.addDummyUsers = require('./addDummyUsers');
