const SERVER_PORT = process.env.PORT || 5000; // Server deployment ❗

// fs module used to interact with the file system
const fs = require('fs');

// Importing express
const express = require('express');
const app = express();

// Importing http module
const http = require('http');
const server = http.createServer(app);

// Creating the server - name of the path that is captured on the server side
const { Server } = require('socket.io');
const io = new Server(server, {
    cors: { origin: '*' },
});

// To serve the static files
const path = require('path');
app.use(express.static(path.join(__dirname, 'build')));

// Handling GET / Request
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Server listens on the port
server.listen(SERVER_PORT, () => {
    console.log('- - -  Server is running on port ' + SERVER_PORT + ' - - - ');
});

/**
 * Using a Queue data structure to store the messages in the original sequence
 * enqueue from back , dequeue from front :     📥 | 5 | 4 | 3 | 2| 1 | 0 |📤
 */
class ChatHistory {
    constructor() {
        this.elements = {};
        this.head = 0; // Front of the queue
        this.tail = 0; // Back of the queue
    }

    // Append data from the back of the queue
    enqueue(message) {
        this.elements[this.tail] = message;
        this.tail++;
    }

    // Remove the message from the front of the queue
    dequeue() {
        if (this.head === this.tail) return null;
        const message = this.elements[this.head];
        delete this.elements[this.head];
        this.head++;
        return message;
    }

    // Return the length of the queue
    length() {
        return this.tail - this.head;
    }

    // Check if the queue is empty
    isEmpty() {
        return this.length() === 0;
    }
}

// Export the data passed (chat history) to a file
exportChatHistory = (data) => {
    fs.writeFile('chatHistory.txt', JSON.stringify(data), (err) => {
        if (err) throw err;
    });
};

// Import the chat history from a file - returns a promise
importChatHistory = () => {
    const promise = new Promise((resolve, reject) => {
        fs.readFile('chatHistory.txt', (err, data) => {
            if (err) {
                reject(err);
            } else {
                // Check for empty file
                if (data.length === 0) {
                    resolve(new ChatHistory());
                } else {
                    let obj = new ChatHistory();
                    let response = JSON.parse(data);
                    // Created a new queue with the imported chat history
                    obj.elements = response.elements;
                    obj.head = response.head;
                    obj.tail = response.tail;
                    resolve(obj);
                }
            }
        });
    });

    return promise;
};

// Loop through the chat history and return a list - returns an array
enumerateChatHistory = (obj) => {
    // Return empty array as the chat history is empty
    if (obj.isEmpty()) return [];

    let chatHistoryList = [];
    for (var key in obj.elements) {
        /*
         *The current property is not a direct property of chatHistory
         *hasOwnProperty skip all the properties along the prototype chain
         */
        if (!obj.elements.hasOwnProperty(key)) continue;
        //Do your logic with the property here
        const element = obj.elements[key];
        chatHistoryList.push(element);
    }
    return chatHistoryList;
};

// Find the index of the user in the connected users array
findUserIndex = (id, users) => {
    return users.findIndex((user) => user.id === id);
};

let chatHistoryQueue = new ChatHistory(); // Chat history queue
let connectedUsers = []; // Array of connected users

// Socket event listener
io.on('connection', (socket) => {
    let currentUserId; // Current user id
    let currentUserName; // Current user name

    // Listen for the user joining event from client
    socket.on('user joined', (data) => {
        console.log(
            '🐣 User Connected: ',
            data.myName + ' - - -> ' + data.myId
        );
        currentUserId = data.myId;
        currentUserName = data.myName;
        // Remove the current user from the list of connected users - to avoid multiple users with the same id
        connectedUsers = connectedUsers.filter((user) => user.id !== data.myId);
        // Add the current user to the list of connected users
        connectedUsers.push({
            id: data.myId,
            name: data.myName,
            isTyping: false,
        });
        // export the chat history to a file
        exportChatHistory(chatHistoryQueue);
        // Send the list of connected users to all the clients
        io.emit('user joined', connectedUsers);
    });

    // Listen for the disconnect event from client
    socket.on('disconnect', () => {
        console.log(
            '🕊️ User Disconnected: ',
            currentUserName + ' - - -> ' + currentUserId
        );

        // Remove the current user from the list of connected users
        connectedUsers = connectedUsers.filter(
            (user) => user.id !== currentUserId
        );
        exportChatHistory(chatHistoryQueue);

        io.emit('done typing', connectedUsers);
    });

    // On receiving a message from the client
    socket.on('chat message', (msg) => {
        socket.broadcast.emit('chat message', msg);
        // Add the message to the chat history queue
        chatHistoryQueue.enqueue(msg);
    });

    // Listen for the typing event from the client
    socket.on('typing', (data) => {
        const index = findUserIndex(data.myId, connectedUsers);
        connectedUsers[index].isTyping = true;
        // send the list of connected users to all the clients -  update the typing status
        io.emit('typing', connectedUsers);
    });

    // Listen for the stop typing event from the client
    socket.on('done typing', (data) => {
        const index = findUserIndex(data.myId, connectedUsers);
        connectedUsers[index].isTyping = false;
        // send the list of connected users to all the clients -  update the typing status
        io.emit('done typing', connectedUsers);
    });

    // Listen for the import chat event from the client
    socket.on('import chat', () => {
        importChatHistory().then((data) => {
            // Set the current chat history to the imported chat history
            chatHistoryQueue = data;
            // Send the imported chat history to all the clients
            io.emit('chat history', enumerateChatHistory(chatHistoryQueue));
        });
    });

    // Listen for the export chat event from the client - export the chat history
    socket.on('export chat', () => {
        exportChatHistory(chatHistoryQueue);
    });

    // Listen for the delete chat event from the client - delete the chat history
    socket.on('delete chat', () => {
        // Create an empty chat history
        chatHistoryQueue = new ChatHistory();
        // Save the empty chat history to the file
        exportChatHistory(chatHistoryQueue);
        // Inform all the clients that the chat history has been deleted
        io.emit('chat history', enumerateChatHistory(chatHistoryQueue));
    });
});
