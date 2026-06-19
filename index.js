import dns from "node:dns";
dns.setServers(["8.8.8.8", "8.8.4.4"]);

import express from "express";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
const port = 5000;

// middleware
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello World, Assignment 10 Server is Running!')
})

const uri = process.env.MONGO_DB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const database = client.db("blood_Donation_db");
    const bloodRequestsCollection = database.collection("allBloods");
    const usersCollection = database.collection("user");

    // all bloods requests & all bloobs show korar api
   app.post('/api/bloodRequests', async (req, res) => {
  const allBloodRequests = req.body;
  const result = await bloodRequestsCollection.insertOne(allBloodRequests);
  res.send(result);
});

    app.post('/api/user/update', async(req, res)=>{
    const user = req.body;
    const result = await usersCollection.updateOne(user);
    res.send(result)
})

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  }
   finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);






app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})