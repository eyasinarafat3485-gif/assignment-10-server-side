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

const logger = (req, res, next) => {
  console.log(logger, req.params);
  next();
}

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
    const sessionCollection = database.collection("sessions");

    // verification related -------------->
    const verifyToken = async (req, res, next) => {
      const authHeader = req.headers?.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized access' })
      }

      const token = authHeader.split(' ')[1]
      if (!token) {
        return res.status(401).send({ message: 'Unauthorized access' })

      }

      const query = { token: token }
      const session = await sessionCollection.findOne(query);
      console.log(session);
      const userId = session.userId;
      console.log(userId);


      next();
    }



    // all user er data get api
    app.get('/api/users', async (req, res) => {
      const users = await usersCollection.find({}).toArray();
      res.send(users);
    });

    // user er status update kora api
    app.patch('/api/users', async (req, res) => {
      const { userId, status, role } = req.body;

      const updateData = {};

      if (status) {
        updateData.status = status;

        if (status.toLowerCase() === 'blocked') {
          updateData.isRestricted = true;
        } else if (status.toLowerCase() === 'active') {
          updateData.isRestricted = false;
        }
      }

      if (role) {
        updateData.role = role.toLowerCase();
      }

      updateData.updatedAt = new Date();

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: updateData }
      );

      res.send(result);
    });

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
        return res.status(401).send({ message: "Unauthorized access" });
        // return res.status(400).send({ message: "User ID query parameter is required" });
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

    // Volunteer Public Requests Page e all data get api
    app.get('/api/volunteer/allRequests', async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const { status, search } = req.query;

      const filter = {};

      // status na pathale shob status dekhabe (default = All)
      if (status && status !== "All") {
        if (status === "InProgress") {
          // ✅ DB te "InProgress" ba "In Progress" (space soho) — dutoi match korbe
          filter.status = { $regex: /^in\s*progress$/i };
        } else {
          filter.status = status;
        }
      }

      // search thakle recipientName, bloodGroup, district, upazila te match
      if (search && search.trim()) {
        const searchRegex = new RegExp(search.trim(), "i");
        filter.$or = [
          { recipientName: searchRegex },
          { bloodGroup: searchRegex },
          { district: searchRegex },
          { upazila: searchRegex },
        ];
      }

      const requests = await bloodRequestsCollection
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();

      const totalRequests = await bloodRequestsCollection.countDocuments(filter);

      res.json({
        success: true,
        requests,
        totalRequests,
        currentPage: page,
        totalPages: Math.ceil(totalRequests / limit)
      });
    });

    // Admin Public Requests Request Page e all data get api
    app.get('/api/admin/allRequests', async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const { status, search } = req.query;

      const filter = {};

      if (status && status !== "All") {
        if (status === "InProgress") {
          filter.status = { $regex: /^in\s*progress$/i };
        } else {
          filter.status = status;
        }
      }

      if (search && search.trim()) {
        const searchRegex = new RegExp(search.trim(), "i");
        filter.$or = [
          { recipientName: searchRegex },
          { bloodGroup: searchRegex },
          { district: searchRegex },
          { upazila: searchRegex },
        ];
      }

      const requests = await bloodRequestsCollection
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();

      const totalRequests = await bloodRequestsCollection.countDocuments(filter);

      res.json({
        success: true,
        requests,
        totalRequests,
        currentPage: page,
        totalPages: Math.ceil(totalRequests / limit)
      });
    });

    app.patch('/api/bloodRequests/:id', async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;

      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: updateData };

      try {
        await bloodRequestsCollection.updateOne(filter, updateDoc);
        const updatedDoc = await bloodRequestsCollection.findOne(filter);
        res.send(updatedDoc);
      } catch (error) {
        res.status(500).send({ message: "Failed to update donation request", error });
      }
    });

    app.post('/api/bloodRequests', async (req, res) => {
      const allBloodRequests = req.body;
      const { userId } = allBloodRequests;

      if (!userId) {
        return res.status(400).send({ success: false, message: "User ID is required" });
      }

      const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

      if (user && user.isRestricted) {
        return res.status(403).send({
          success: false,
          message: "Your account is restricted or blocked. You cannot create a blood request."
        });
      }

      allBloodRequests.createdAt = new Date();
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

    //  DONOR SEARCH API
    app.get('/api/donors/search', async (req, res) => {
      const { bloodGroup, district, upazila } = req.query;

      if (!bloodGroup && !district && !upazila) {
        return res.json({ success: true, data: [] });
      }

      const filter = {};

      if (bloodGroup) {
        filter.bloodGroup = bloodGroup;
      }

      if (district) {
        filter.district = { $regex: district, $options: 'i' };
      }

      if (upazila) {
        filter.upazila = { $regex: upazila, $options: 'i' };
      }

      const donors = await usersCollection
        .find(filter)
        .project({ password: 0 })
        .toArray();

      res.json({
        success: true,
        data: donors
      });
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