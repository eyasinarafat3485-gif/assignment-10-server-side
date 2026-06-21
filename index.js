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

    // (1) BLOOD REQUESTED RELATED ALL API ARE HERE----------->>>>>>>>>>>>>>>>>>>.
    //  allbloodRequests get korar jonno

    app.get('/api/allbloodRequests', async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const filter = { status: "Pending" }; // ✅ শুধু Pending request

      const allbloodRequests = await bloodRequestsCollection
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();

      const totalRequests = await bloodRequestsCollection.countDocuments(filter); // ✅ filter সহ count

      res.json({
        success: true,
        requests: allbloodRequests,
        totalRequests,
        currentPage: page,
        totalPages: Math.ceil(totalRequests / limit)
      });
    });

    app.get('/api/my/bloodRequests', async (req, res) => {
      const userId = req.query.userId;

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      if (!userId) {
        return res.status(400).send({ message: "User ID query parameter is required" });
      }

      const query = { userId: userId };

      try {
        // ১. এই ইউজারের মোট কয়টি রিকোয়েস্ট আছে তা কাউন্ট করা (পেজিনেশন ইউআই-এর জন্য জরুরি)
        const totalRequests = await bloodRequestsCollection.countDocuments(query);

        // ২. নির্দিষ্ট পেজের জন্য মাত্র ৫টি ডেটা লোড করা
        const requests = await bloodRequestsCollection.find(query)
          .sort({ createdAt: -1 }) // নতুন রিকোয়েস্টগুলো টেবিলের প্রথমে দেখাবে
          .skip(skip)
          .limit(limit)
          .toArray();

        // ফ্রন্টএন্ডে অবজেক্ট আকারে requests এবং totalRequests পাঠানো
        res.send({ requests, totalRequests });
      } catch (error) {
        res.status(500).send({ message: "Internal server error", error });
      }
    });

    // req details pawar jonno api 
    app.get('/api/bloodRequests/:id', async (req, res) => {
      const id = req.params.id;
      const query = {
        _id: new ObjectId(id)
      }
      const result = await bloodRequestsCollection.findOne(query);
      res.send(result);
    })

    app.patch('/api/bloodRequests/:id', async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;

      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: updateData };

      await bloodRequestsCollection.updateOne(filter, updateDoc);
      const updatedDoc = await bloodRequestsCollection.findOne(filter);
      res.send(updatedDoc);
    });

    app.post('/api/bloodRequests', async (req, res) => {
      const allBloodRequests = req.body;
      const result = await bloodRequestsCollection.insertOne(allBloodRequests);
      res.send(result);
    });

    // user er data edit kore data update korar jonno api ----- POST
    app.post('/api/user/update', async (req, res) => {
      try {
        // console.log(req.body);
        const { id, name, bloodGroup, district, upazila, image } = req.body;


        const filter = { _id: new ObjectId(id) }; // বা id field

        const updateDoc = {
          $set: {
            name,
            bloodGroup,
            district,
            upazila,
            image,
            updatedAt: new Date(),
          },
        };

        const result = await usersCollection.updateOne(filter, updateDoc);

        if (result.modifiedCount > 0) {
          return res.send({
            success: true,
            message: "User updated successfully",
          });
        }

        return res.send({
          success: false,
          message: "No changes made or user not found",
        });

      } catch (error) {
        console.log(error);
        res.status(500).send({
          success: false,
          message: "Server error",
        });
      }
    });

    // Request delete korar simple API
    app.delete('/api/bloodRequests/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const result = await bloodRequestsCollection.deleteOne(query);
      res.send(result);
    });

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