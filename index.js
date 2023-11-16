const express = require('express')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors')
require('dotenv').config()

const port = process.env.PORT || 3000

const app = express()

// MIDDLEWARE
app.use(cors({
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
}))

app.use(express.json())
// Serve the static files from the React app
app.use(express.static(path.join(__dirname, 'client/build')));

// Handle requests to all routes by serving the React app
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

app.get('/', async (req, res) => {

    res.send('SERVER IS RUNNING')
})


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
        // await client.connect();
        // faziul

        const courseCollection = client.db("SnapAcademyDB").collection("courses");
        const usersCollection = client.db("SnapAcademyDB").collection("users");
        const reviewsCollection = client.db("SnapAcademyDB").collection("reviews");
        const subscribationCollection = client.db("SnapAcademyDB").collection("subscribations");

        // JWT POST
        app.post('/jwt', (req, res) => {

            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })

            res.send({ token })
        })

        // ALL USERS API
        app.get('/allUsers', async (req, res) => {

            const users = await usersCollection.find().toArray();
            res.send(users);
        })

        app.post('/allUsers', async (req, res) => {

            const user = req.body;
            const emaiQuery = { email: user.email }
            const existingUser = await usersCollection.findOne(emaiQuery);

            if (existingUser) {
                return res.send({ message: 'user already exists' })
            }

            const result = await usersCollection.insertOne(user);
            res.send(result);
        })

        app.patch('/allUsers/admin/:email', async (req, res) => {

            const { email } = req.params
            const { role } = req.body

            const updateUserRole = {
                $set: { role }
            };

            const updateUser = await usersCollection.updateOne({ email }, updateUserRole)
            res.send(updateUser)
            console.log(email, role);
        })

        app.delete('/allUsers', async (req, res) => {

            const { email } = req.query
            const users = await usersCollection.findOne({ email })

            await usersCollection.deleteOne(users)
            res.send({ message: 'Successfully delete user' });
        })

        // ALL COURSES API
        app.get('/allCourses', async (req, res) => {

            const allCourse = await courseCollection.find().toArray()
            res.send(allCourse)
        })

        app.get('/courses', async (req, res) => {

            try {

                // Sort Out The Lowest and Hiest Price
                const priceStats = await courseCollection.aggregate([
                    {
                        $group: {
                            _id: null,
                            minPrice: { $min: { $toDouble: "$price" } },
                            maxPrice: { $max: { $toDouble: "$price" } }
                        }
                    }
                ]).toArray();
                // Extract the results
                const { minPrice, maxPrice } = priceStats[0];

                // Find Default Courses and Price Query
                const { priceQuery } = req.query;
                let query = {};
                if (priceQuery !== '') {
                    query = { price: { $lte: parseFloat(priceQuery) } };
                }
                const courses = await courseCollection.find(query).toArray();

                // SEND DATA TO CLIENT LOWEST PRICE, HIGHEST PRICE COURSES 
                res.send({ minPrice, maxPrice, courses });

            } catch (error) {
                console.error(error);
                res.status(500).send('Internal Server Error');
            }
        })

        app.get('/course/:_id', async (req, res) => {

            const { _id } = req.params
            const singleCourse = await courseCollection.findOne({ _id: new ObjectId(_id) })

            res.send(singleCourse)
        })

        // USER REVIEW
        app.post('/reviews/:email', async (req, res) => {

            const { email, name, photo, rating, suggetion, review } = req.body
            const addReview = { email, name, photo, rating, suggetion, review }

            await reviewsCollection.insertOne({ addReview })
            res.send({ message: 'review added' })
        })

        // SUBSCRIBE
        app.post('/subscribation', async (req, res) => {

            const { email } = req.body

            const existingUser = await subscribationCollection.findOne({ email });
            if (existingUser) {
                return res.send({ message: 'email already exists' })
            }

            await subscribationCollection.insertOne({ email })
        })


        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.listen(port, () => {
    console.log('Server is running on,', port);
})