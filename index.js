const express = require("express");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 8000;

app.get("/", (req, res) => {
  res.send("hello");
});

app.listen(port, () => {
  console.log(`Server Running on port ${port}`);
});
