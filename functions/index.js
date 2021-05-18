const functions = require("firebase-functions");
const admin = require('firebase-admin');
const _ = require('lodash');

admin.initializeApp(functions.config().firestore);
admin.firestore().settings({ timestampsInSnapshots: true });

let eventId = '';
let questions = null;
let rooms = [];

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

function calculateScore(...users) {
    let score = 0;
    for (let i = 0; i < questions.length; i++) {
        let q = questions[i];
        if (q.type == 'single') {
            if (users[0].answers[i][0] == users[1].answers[i][0]) score += q.priority;
            else score += 0;
        }
        else if (q.type == 'multiple') {
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

async function nullUserUpdate(users) {
    for (let user of users) {
        user.usersRoom = null;
        user.userLeft = true;
        let docId = user.id;
        delete user.id;
        await admin.firestore().collection('events').doc(eventId).collection('users').doc(docId).set(user);
    }
}

let scoreList = [];
function differentTypeMatching(userTypeA, userTypeB) {
    scoreList = [];
    for (userA of userTypeA) {
        for (userB of userTypeB) {
            if (!userA.usersSpokenTo.find(x => x.includes(userB.id))) {
                scoreList.push({
                    userA,
                    userB,
                    score: calculateScore(userA, userB)
                })
            }
        }
    }
    if (scoreList.length == 0) return;
    scoreList.sort((a, b) => b.score - a.score);
    let bestMatching = scoreList.shift();
    bestMatching.userA.usersSpokenTo.push(bestMatching.userB.id);
    bestMatching.userB.usersSpokenTo.push(bestMatching.userA.id);
    rooms.push([bestMatching.userA, bestMatching.userB]);
    _.remove(userTypeA, bestMatching.userA);
    _.remove(userTypeB, bestMatching.userB);
    differentTypeMatching(userTypeA, userTypeB);
}

let sameTypeUserScoreList = [];
function sameTypeMatching(users) {
    sameTypeUserScoreList = [];
    if (users.length == 1 || users.length == 0) {
        return;
    }
    for (let i = 0; i < users.length - 1; i++) {
        for (let j = i + 1; j < users.length; j++) {
            if (!users[i].usersSpokenTo.find(x => x.includes(users[j].id))) {
                sameTypeUserScoreList.push({
                    user1: users[i],
                    user2: users[j],
                    score: calculateScore(users[i], users[j])
                });
            }
        }
    }
    if (sameTypeUserScoreList.length == 0) return;
    sameTypeUserScoreList.sort((a, b) => b.score - a.score);
    let bestMatching = sameTypeUserScoreList.shift();
    bestMatching.user1.usersSpokenTo.push(bestMatching.user2.id);
    bestMatching.user2.usersSpokenTo.push(bestMatching.user1.id);
    rooms.push([bestMatching.user1, bestMatching.user2]);
    _.remove(users, bestMatching.user1);
    _.remove(users, bestMatching.user2);
    sameTypeMatching(users);
}

let leftAsScores = [];
function leftAsRoom(users) {
    if (users.length == 0) return;
    let roomByTwoA = rooms.filter(u => u[0].userType == 'A' && u[1].userType == 'A');
    let roomByTwoB = rooms.filter(u => u[0].userType == 'B' && u[1].userType == 'B');
    if (roomByTwoA.length) {
        for (room of roomByTwoA) {
            for (userA of users) {
                if (!room[0].usersSpokenTo.includes(userA.id) || room[1].usersSpokenTo.includes(userA.id)) {
                    leftAsScores.push({
                        room,
                        userA,
                        score: calculateScore(userA, room[0]) / 3 + calculateScore(userA, room[1]) / 3 + calculateScore(room[0], room[1]) / 3
                    });
                }
            }
        }
        if (leftAsScores.length) {
            leftAsScores.sort((a, b) => b.score - a.score);
            let bestMatching = leftAsScores.shift();
            bestMatching.room[0].usersSpokenTo.push(bestMatching.userA.id);
            bestMatching.room[1].usersSpokenTo.push(bestMatching.userA.id);
            bestMatching.userA.usersSpokenTo.push(bestMatching.room[0].id, bestMatching.room[1].id);
            rooms[rooms.findIndex(r => (r[0].id == bestMatching.room[0].id) && (r[1].id == bestMatching.room[1].id))].push(bestMatching.userA);
            _.remove(users, bestMatching.userA);
        }
        else {

        }
    }
}

exports.createEventRooms = functions.https.onRequest(async (req, res) => {
    rooms = [];
    scoreList = [];
    sameTypeUserScoreList = [];
    leftAsScores = [];
    eventId = req.query.eventId;
    deleteOldRooms();
    questions = await getQuestions();
    let [userTypeA, userTypeB] = await getUsers();
    differentTypeMatching(userTypeA, userTypeB);
    if (userTypeA.length) sameTypeMatching(userTypeA);
    if (userTypeB.length) sameTypeMatching(userTypeB);
    let roomByDifferentType = rooms.filter(u => (u[0].userType == 'A' && u[1].userType == 'B') || (u[0].userType == 'B' && u[1].userType == 'A'));
    // Update Rooms in firebase
    // for(let room of rooms) createRoom(room);
    if (userTypeA.length) leftAsRoom(userTypeA);
    // nullUserUpdate(userTypeA);
    res.send(rooms);
});

exports.addDummyUsers = require('./addDummyUsers');