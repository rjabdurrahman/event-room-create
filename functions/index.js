const functions = require("firebase-functions");
const admin = require('firebase-admin');
const _ = require('lodash');

admin.initializeApp(functions.config().firestore);
admin.firestore().settings({ timestampsInSnapshots: true });

async function deleteOldRooms() {
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

async function getQuestions() {
    const snapshot = await admin.firestore().collection('events').doc(eventId).get();
    return snapshot.data().questions;
}

async function getUsers() {
    const snapshot = await admin.firestore().collection('events').doc(eventId).collection('users').where("userLeft", "==", false).get();
    let eventUsers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    eventUsers.forEach(x => {
        if (!x.usersSpokenTo) x.usersSpokenTo = [];
        x.usersRoom = null;
    });
    let userTypeA = eventUsers.filter(x => x.userType == "A");
    let userTypeB = eventUsers.filter(x => x.userType == "B");
    return [userTypeA, userTypeB];
}

function calculateScore(questions, users) {
    let score = 0;
    for(let i = 0; i < questions.length; i++) {
        let q = questions[i];
        if(q.type == 'single') {
            if(users[0].answers[i][0] == users[1].answers[i][0]) score+= q.priority;
            else score += 0;
        }
        else if(q.type == 'multiple') {
            score += _.intersection(users[0].answers[i], users[1].answers[i]).length * q.priority / q.answers.length;
        }
    }
    return score;
}

async function createRoom(users) {
    try {
        let roomData = users.reduce(function (result, user, index) {
            result['u' + index] = user.id;
            return result;
        }, {});
        console.log(roomData);
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

let questions = null;
let scoreList = [];
let rooms = [];
function differentTypeMatching(userTypeA, userTypeB) {
    scoreList = [];
    for(userA of userTypeA) {
        for(userB of userTypeB) {
            if(!userA.usersSpokenTo.find(x => x.includes(userB.id))) {
                scoreList.push({
                    userA,
                    userB,
                    score: calculateScore(questions, [userA, userB])
                })
            }
        }
    }
    if(scoreList.length == 0) return;
    scoreList.sort((a,b) => b.score - a.score);
    let bestMatching = scoreList.shift();
    bestMatching.userA.usersSpokenTo.push(bestMatching.userB.id);
    bestMatching.userB.usersSpokenTo.push(bestMatching.userA.id);
    createRoom([bestMatching.userA, bestMatching.userB], eventId);
    _.remove(userTypeA, bestMatching.userA);
    _.remove(userTypeB, bestMatching.userB);
    differentTypeMatching(userTypeA, userTypeB);
}
let eventId = '';
exports.createEventRooms = functions.https.onRequest(async (req, res) => {
    eventId = req.query.eventId;
    deleteOldRooms(eventId);
    questions = await getQuestions();
    let [userTypeA, userTypeB] = await getUsers();
    differentTypeMatching(userTypeA, userTypeB);
    res.send(rooms);
});

exports.addDummyUsers = require('./addDummyUsers');