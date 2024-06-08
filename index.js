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

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;

      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // user related api
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
