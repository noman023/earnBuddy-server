const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 8000;

// middleware
app.use(cors());
app.use(express.json());

// mongodb atlas connection uri
const uri = `mongodb+srv://${process.env.DB_USER_NAME}:${process.env.DB_PASS}@cluster0.faeme9d.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const db = client.db("earnBuddy");
    const usersCollection = db.collection("users");
    const tasksCollection = db.collection("tasks");
    const submissionCollection = db.collection("submission");
    const reviewsCollection = db.collection("reviews");

    // ------------MIDDLEWARES START-----------
    function verifyToken(req, res, next) {
      // if no token
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      // remove "Bearer" from authorization
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        // if token not matched
        if (err) {
          return res.status(400).send({ message: "unauthorized access" });
        }

        req.decoded = decoded;
        next();
      });
    }

    async function verifyAdmin(req, res, next) {
      const email = req.decoded.email;
      const query = { email: email };

      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "admin";

      // if not admin
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    }

    async function verifyTaskCreator(req, res, next) {
      const email = req.decoded.email;
      const query = { email: email };

      const user = await usersCollection.findOne(query);
      const isCreator = user?.role === "taskCreator";

      // if not tast creator
      if (!isCreator) {
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    }

    async function verifyWorker(req, res, next) {
      const email = req.decoded.email;
      const query = { email: email };

      const user = await usersCollection.findOne(query);
      const isWorker = user?.role === "worker";

      // if not worker
      if (!isWorker) {
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    }

    // ---------------MIDDLEWARES END----------------------

    // ---------------JWT RELATED API START--------------
    app.post("/jwt", async (req, res) => {
      const user = req.body;

      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });
    // ------------------JWT RELATED API END-------------

    // ----------------USER RELATED API START-------------
    app.get("/users", async (req, res) => {
      const userRole = req.query?.role;

      // if role exist then return user of that specific role
      if (userRole) {
        const query = { role: userRole };
        const usersByRole = await usersCollection.find(query).toArray();

        return res.send(usersByRole);
      }

      // return all user
      const allUsers = await usersCollection.find().toArray();
      return res.send(allUsers);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;

      // check if user exist
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exist!", insertedId: null });
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.patch("/users/:id", async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const filter = { _id: new ObjectId(id) };

      // if role exist in query then update role
      if (req.query?.role) {
        const updatedDoc = { $set: { role: data } };

        const result = await usersCollection.updateOne(filter, updatedDoc);
        res.send(result);
      } else if (req.query?.coins) {
        // if coins exist in query then update coins
        const updatedDoc = { $set: { coins: data } };

        const result = await usersCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    });
    // ------------------USER RELATED API END------------------

    // -------------------TASK RELATED API START-----------------
    app.get("tasks", async (req, res) => {
      const email = req.query?.email;

      // if email exist in query then send tasks by filtering using that email
      if (email) {
        const query = { creator_email: email };
        const userTasks = await tasksCollection.find(query).toArray();

        return res.send(userTasks);
      }

      // send all tasks
      const allTask = await tasksCollection.find().toArray();
      return res.send(allTask);
    });

    app.get("tasks/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const result = await tasksCollection.findOne(query);
      res.send(result);
    });

    app.post("tasks", async (req, res) => {
      const postData = req.body;
      const result = await tasksCollection.insertOne(postData);

      return res.send(result);
    });
    // -----------------TASK RELATED API END----------------

    // -----------------SUBMISSION RELATED API END----------------
    app.get("submission", async (req, res) => {
      const query = { workerEmail: req.query?.email };
      const userSubmission = await submissionCollection.find(query).toArray();

      return res.send(userSubmission);
    });

    app.post("submission", async (req, res) => {
      const submissionData = req.body;
      const result = await submissionCollection.insertOne(submissionData);

      return res.send(result);
    });
    // -----------------SUBMISSION RELATED API END----------------

    // -----------------REVIEWS RELATED API END----------------
    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection.find().toArray();

      return res.send(result);
    });
    // -----------------REVIEWS RELATED API END----------------

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server Running on port ${port}`);
});
