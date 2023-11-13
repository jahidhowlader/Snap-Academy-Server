const express = require('express')
require('dotenv').config()

const cors = require('cors')
const port = process.env.PORT || 3000

const app = express()

// MIDDLEWARE
app.use(cors())
app.use(express.json())


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.h88b4w7.mongodb.net/?retryWrites=true&w=majority`;

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

        const courseCollection = client.db("SnapAcademyDB").collection("courses");

        // ALL COURSES API
        app.get('/courses', async (req, res) => {

            const allCourss = await courseCollection.find({}).toArray()
            res.send(allCourss)
        })

        app.get('/course/:_id', async (req, res) => {

            const { _id } = req.params
            console.log(_id);
            const singleCourse = await courseCollection.findOne({ _id: new ObjectId(_id) })

            res.send(singleCourse)
        })


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', async (req, res) => {

    res.send('hahahahahaha')
})

app.listen(port, () => {
    console.log('Server is running on,', port);
})