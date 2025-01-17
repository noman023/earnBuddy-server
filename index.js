const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 8000;

// middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://earnbuddy-dbb3d.web.app",
      "https://earnbuddy-dbb3d.firebaseapp.com",
    ],
  })
);
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
    const withDrawCollection = db.collection("withdraw");
    const paymentsCollection = db.collection("payments");

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
    // get user(s) by query
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const userRole = req.query?.role;

      // if role exist then return user of that specific role
      if (userRole) {
        const query = { role: userRole };
        const usersByRole = await usersCollection.find(query).toArray();

        return res.send(usersByRole);
      }

      return res.send({ message: "something went wrong!" });
    });

    // get user role by id
    app.get("/users/:email", verifyToken, async (req, res) => {
      const { email } = req.params;
      const query = { email: email };

      // if coins in query then send coins
      if (req.query.coins) {
        const user = await usersCollection.findOne(query);

        return res.send({ coins: user.coins });
      }

      const user = await usersCollection.findOne(query);

      return res.send(user.role);
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

    // update user role
    app.patch("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const filter = { _id: new ObjectId(id) };

      // upate role
      const updatedDoc = { $set: { role: data.newRole } };

      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // delete user
    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });
    // ------------------USER RELATED API END------------------

    // -------------------TASK RELATED API START-----------------
    // get all task or task by creator email
    app.get("/tasks", verifyToken, async (req, res) => {
      const email = req.query?.email;

      // if email exist in query then send tasks by filtering using that email
      if (email) {
        const query = { creatorEmail: email };
        const userTasks = await tasksCollection.find(query).toArray();

        return res.send(userTasks);
      }

      // send all tasks
      const allTask = await tasksCollection.find().toArray();
      return res.send(allTask);
    });

    app.get("/tasks/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const result = await tasksCollection.findOne(query);
      res.send(result);
    });

    // add task
    app.post("/tasks", verifyToken, verifyTaskCreator, async (req, res) => {
      const postData = req.body;
      const quantity = postData.quantity;
      const amount = postData.payAmount;
      const totalCoins = quantity * amount;

      // find user
      const query = { email: postData.creatorEmail };
      const user = await usersCollection.findOne(query);

      // update user coins
      const newCoins = user.coins - totalCoins;
      const updateDoc = {
        $set: {
          coins: newCoins,
        },
      };

      await usersCollection.updateOne(query, updateDoc);

      // insert task data
      const result = await tasksCollection.insertOne(postData);
      return res.send(result);
    });

    // update task
    app.patch(
      "/tasks/:id",
      verifyToken,
      verifyTaskCreator,
      async (req, res) => {
        const { id } = req.params;
        const data = req.body;
        const query = { _id: new ObjectId(id) };

        const updateDoc = {
          $set: {
            title: data.title,
            details: data.details,
            submitInfo: data.submitInfo,
          },
        };

        const result = await tasksCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    );

    // delete task
    app.delete("/tasks/:id", verifyToken, async (req, res) => {
      const { id } = req.params;

      // find specific task
      const query = { _id: new ObjectId(id) };
      const task = await tasksCollection.findOne(query);

      // find user
      const foundUser = await usersCollection.findOne({
        email: task.creatorEmail,
      });

      // calculate coins and add to user account
      const totalCoins = foundUser.coins + task.quantity * task.payAmount;
      const updateDoc = {
        $set: {
          coins: totalCoins,
        },
      };

      // update coins
      await usersCollection.updateOne({ email: foundUser.email }, updateDoc);

      const result = await tasksCollection.deleteOne(query);
      res.send(result);
    });
    // -----------------TASK RELATED API END----------------

    // -----------------SUBMISSION RELATED API END----------------
    app.get("/submission/:email", verifyToken, async (req, res) => {
      const { email } = req.params;
      const { role } = req.query;

      let query = {};
      // set query string based on role
      if (role === "worker") {
        query = { workerEmail: email, status: "approved" };
      } else if (role === "taskCreator") {
        query = { creatorEmail: email, status: "pending" };
      }

      const submissions = await submissionCollection.find(query).toArray();
      return res.send(submissions);
    });

    // get all submit of worker
    app.get(
      "/submissionAll/:email",
      verifyToken,
      verifyWorker,
      async (req, res) => {
        const { email } = req.params;
        const query = { workerEmail: email };

        const submissions = await submissionCollection.find(query).toArray();
        return res.send(submissions);
      }
    );

    app.post("/submission", verifyToken, verifyWorker, async (req, res) => {
      const data = req.body;
      const result = await submissionCollection.insertOne(data);

      return res.send(result);
    });

    // change status to reject
    app.patch(
      "/subReject/:id",
      verifyToken,
      verifyTaskCreator,
      async (req, res) => {
        const { id } = req.params;
        const query = { _id: id };

        const updateDoc = {
          $set: {
            status: "rejected",
          },
        };

        const result = await submissionCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    );

    // change task status to approve and user coins increase
    app.patch(
      "/subApprove/:id",
      verifyToken,
      verifyTaskCreator,
      async (req, res) => {
        const { id } = req.params;
        const query = { _id: id };

        // find task
        const task = await submissionCollection.findOne(query);

        // find worker
        const filter = { email: task.workerEmail };
        const worker = await usersCollection.findOne(filter);

        // update worker coins
        const workerCoinUpdate = {
          $set: {
            coins: worker.coins + task.payAmount,
          },
        };
        await usersCollection.updateOne(filter, workerCoinUpdate);

        // update task status
        const taskStatusUpdate = {
          $set: {
            status: "approved",
          },
        };

        const result = await submissionCollection.updateOne(
          query,
          taskStatusUpdate
        );

        res.send(result);
      }
    );
    // -----------------SUBMISSION RELATED API END----------------

    // -----------------WITHDRAW RELATED API START ----------------
    app.get("/withdraw", verifyToken, verifyAdmin, async (req, res) => {
      const result = await withDrawCollection.find().toArray();
      return res.send(result);
    });

    app.post("/withdraw", verifyToken, verifyWorker, async (req, res) => {
      const data = req.body;

      const result = await withDrawCollection.insertOne(data);
      return res.send(result);
    });

    // delete withdraw post and decrease user coins
    app.delete(
      "/withdrawApprove/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;
        const query = { _id: new ObjectId(id) };

        // Find the withdrawal post by ID
        const withdrawPost = await withDrawCollection.findOne(query);

        // Find the user by email
        const userQuery = { email: withdrawPost.workerEmail };
        const user = await usersCollection.findOne(userQuery);

        // Decrease the user's coins by the withdrawal amount
        const newCoinBalance = user.coins - withdrawPost.withdrawCoin;
        const updateUserDoc = {
          $set: {
            coins: newCoinBalance,
          },
        };
        await usersCollection.updateOne(userQuery, updateUserDoc);

        // Delete the withdrawal post
        const result = await withDrawCollection.deleteOne(query);
        res.send(result);
      }
    );

    // -----------------WITHDRAW RELATED API END ----------------

    // -----------------PAYMENTS RELATED API START ----------------
    app.post(
      "/create-payment-intent",
      verifyToken,
      verifyTaskCreator,
      async (req, res) => {
        const { price } = req.body;
        const amount = parseInt(price * 100);

        // Create a PaymentIntent with the order amount and currency
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      }
    );

    // get user payments data
    app.get(
      "/payments/:email",
      verifyToken,
      verifyTaskCreator,
      async (req, res) => {
        const { email } = req.params;
        const query = { email: email };

        const result = await paymentsCollection.find(query).toArray();
        res.send(result);
      }
    );

    // add payment data and update user coins
    app.post("/payments", verifyToken, verifyTaskCreator, async (req, res) => {
      const data = req.body;
      const query = { email: data.email };

      const user = await usersCollection.findOne(query);

      // update user coins
      const updatedDoc = {
        $set: {
          coins: user.coins + data.coins,
        },
      };
      await usersCollection.updateOne(query, updatedDoc);

      // add payment data
      const result = await paymentsCollection.insertOne(data);
      res.send(result);
    });
    // -----------------PAYMENTS RELATED API END ----------------

    // -----------------STATS RELATED API START ----------------
    // get worker stats
    app.get(
      "/workerStats/:email",
      verifyToken,
      verifyWorker,
      async (req, res) => {
        const { email } = req.params;
        const user = await usersCollection.findOne({ email });

        // Calculate total submissions
        const totalSubmissions = await submissionCollection.countDocuments({
          workerEmail: email,
        });

        // Calculate total earnings from approved submissions
        const totalEarningsPipeline = [
          { $match: { workerEmail: email, status: "approved" } },
          { $group: { _id: null, totalEarnings: { $sum: "$payAmount" } } },
        ];

        const earningsResult = await submissionCollection
          .aggregate(totalEarningsPipeline)
          .toArray();

        const totalEarnings =
          earningsResult.length > 0 ? earningsResult[0].totalEarnings : 0;

        // Prepare the response
        const response = {
          availableCoins: user.coins,
          totalSubmissions,
          totalEarnings,
        };

        res.send(response);
      }
    );

    // task creator stats
    app.get(
      "/creatorStats/:email",
      verifyToken,
      verifyTaskCreator,
      async (req, res) => {
        const { email } = req.params;

        // Get the user's available coins
        const user = await usersCollection.findOne({ email });
        const availableCoins = user ? user.coins : 0;

        // Calculate the sum of all pending tasks
        const pendingTasks = await tasksCollection
          .aggregate([
            { $match: { creatorEmail: email, status: "pending" } },
            { $group: { _id: null, total: { $sum: "$quantity" } } },
            { $project: { _id: 0, total: 1 } },
          ])
          .toArray();

        // Calculate the total payment paid by the user
        const totalPayments = await paymentsCollection
          .aggregate([
            { $match: { email: email } },
            {
              $group: {
                _id: null,
                total: { $sum: "$price" },
              },
            },
            { $project: { _id: 0, total: 1 } },
          ])
          .toArray();

        res.send({
          availableCoins,
          pendingTasks: pendingTasks.length > 0 ? pendingTasks[0].total : 0,
          totalPayments: totalPayments.length > 0 ? totalPayments[0].total : 0,
        });
      }
    );

    // admin stats
    app.get("/adminStats", verifyToken, verifyAdmin, async (req, res) => {
      // Count total users
      const totalUsers = await usersCollection.countDocuments();

      // Calculate total coins
      const totalCoins = await usersCollection
        .aggregate([
          { $group: { _id: null, total: { $sum: "$coins" } } },
          { $project: { _id: 0, total: 1 } },
        ])
        .toArray();

      // Calculate total payments
      const totalPayments = await paymentsCollection
        .aggregate([
          { $group: { _id: null, total: { $sum: "$price" } } },
          { $project: { _id: 0, total: 1 } },
        ])
        .toArray();

      res.send({
        totalUsers,
        totalCoins: totalCoins.length > 0 ? totalCoins[0].total : 0,
        totalPayments: totalPayments.length > 0 ? totalPayments[0].total : 0,
      });
    });
    // -----------------STATS RELATED API END ----------------

    // -----------------REVIEWS RELATED API END----------------
    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection.find().toArray();

      return res.send(result);
    });
    // -----------------REVIEWS RELATED API END----------------

    // -----------------TOTAL EARNERS API START----------------
    app.get("/topEarners", async (req, res) => {
      const topEarners = await usersCollection
        .find()
        .sort({ coins: -1 })
        .limit(6)
        .toArray();

      res.send(topEarners);
    });

    // -----------------TOTAL EARNERS API END----------------

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
