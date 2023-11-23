const express = require('express')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const body_parser = require('body-parser')
const cors = require('cors')
const jwt = require('jsonwebtoken');
var cookieParser = require('cookie-parser')
const globals = require('node-global-storage');
const { default: axios } = require('axios');
const { v4: uuidv4 } = require('uuid')
require('dotenv').config()

const port = process.env.PORT || 3000

const app = express()

// MIDDLEWARE
app.use(cors({
    origin: 'https://snap-academy-client.web.app',
    credentials: true
}))
app.use(body_parser.json())
app.use(express.json())
app.use(cookieParser())

// VERIFYJWT TOKEN MIDDLEWARE
const verifyJWT = (req, res, next) => {

    const clientToken = req.headers.authorization;

    if (!clientToken) {
        return res.status(401).send({ error: true, message: 'unauthorized access' });
    }

    jwt.verify(clientToken, process.env.ACCESS_TOKEN_SECRET, (err, email) => {

        if (err) {
            return res.status(498).send({ error: true, message: 'Invaild Token..! Please Login again..' })
        }

        req.user = email;
        next();
    })
}


// ********************************************************************************************************************************************
// **********************************************************START BACKEND ROUTES**********************************************************************************

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
        // faziul

        const courseCollection = client.db("SnapAcademyDB").collection("courses");
        const usersCollection = client.db("SnapAcademyDB").collection("users");
        const reviewsCollection = client.db("SnapAcademyDB").collection("reviews");
        const subscribationCollection = client.db("SnapAcademyDB").collection("subscribations");
        const paymentCollection = client.db("SnapAcademyDB").collection("payments");

        // JWT POST
        app.post('/jwt', (req, res) => {

            const email = req.body;

            const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '24h' })

            res.send({ token })
        })

        // verifyAdmin
        const verifyAdmin = async (req, res, next) => {

            const user = await usersCollection.findOne({ email: req.user.email });

            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'forbidden access' });
            }

            next();
        }

        // ALL USERS API
        app.get('/allUsers', verifyJWT, verifyAdmin, async (req, res) => {

            const users = await usersCollection.find().toArray();
            res.send(users);
        })

        // CHECK ADMIN AND USER ROLE
        app.get('/checkRole/:email', verifyJWT, async (req, res) => {

            const user = await usersCollection.findOne({ email: req.params.email })

            res.send(user.role)
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

        app.patch('/allUsers/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {

            const { email } = req.params
            const { role } = req.body

            const updateUserRole = {
                $set: { role }
            };

            const updateUser = await usersCollection.updateOne({ email }, updateUserRole)
            res.send(updateUser)
        })

        app.delete('/allUsers', verifyJWT, verifyAdmin, async (req, res) => {

            const { email } = req.query
            const users = await usersCollection.findOne({ email })

            await usersCollection.deleteOne(users)
            res.send({ message: 'Successfully delete user' });
        })

        // ALL COURSES API
        app.get('/allCourses', verifyJWT, verifyAdmin, async (req, res) => {

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
                const { priceQuery, searchQuery } = req.query;

                let query = {};

                if (priceQuery !== '') {
                    query.price = { $lte: parseFloat(priceQuery) };
                }

                // Add search filter if present
                if (searchQuery) {
                    query.title = { $regex: new RegExp(searchQuery, 'i') };
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
        app.get('/reviews', async (req, res) => {

            const reviews = await reviewsCollection.find().toArray()
            res.send(reviews)
        })

        app.post('/reviews/:email', verifyJWT, async (req, res) => {

            const { email, name, photo, rating, suggetion, review } = req.body
            const addReview = { email, name, photo, rating, suggetion, review }

            await reviewsCollection.insertOne(addReview)
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


        // **************************************************************************************************************************
        // ****************************************************PATMENT WITH BKASH START ******************************************************

        // PAYMENT MIDDLEWARE
        const bkash_auth = async (req, res, next) => {

            globals.unset('id_token')
            // globals.unset('courseId')

            try {
                const { data } = await axios.post(process.env.bkash_grant_token_url, {
                    app_key: process.env.bkash_api_key,
                    app_secret: process.env.bkash_secret_key,
                }, {
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        username: process.env.bkash_username,
                        password: process.env.bkash_password,
                    }
                })

                globals.set('id_token', data.id_token, { protected: true })
                next()

            } catch (error) {
                return res.status(401).json({ error: error.message })
            }
        }

        // 01823074817
        app.post('/api/bkash/payment/create', bkash_auth, async (req, res) => {

            const { amount, courseId, email } = req.body

            globals.set('userId', amount, courseId)
            globals.set('courseId', courseId)
            globals.set('email', email)

            try {
                const { data } = await axios.post(process.env.bkash_create_payment_url, {
                    mode: '0011',
                    payerReference: " ",
                    callbackURL: 'http://localhost:3000/api/bkash/payment/callback',
                    amount: amount,
                    currency: "BDT",
                    intent: 'sale',
                    merchantInvoiceNumber: 'Inv' + uuidv4().substring(0, 5)
                }, {
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json",
                        authorization: globals.get('id_token'),
                        'x-app-key': process.env.bkash_api_key,
                    }
                })

                return res.status(200).json({ bkashURL: data.bkashURL })

            } catch (error) {
                return res.status(401).json({ error: error.message })
            }
        })

        // PAYMENT GET API
        app.get('/api/bkash/payment/callback', bkash_auth, async (req, res) => {

            const { paymentID, status } = req.query


            if (status === 'cancel' || status === 'failure') {
                return res.redirect(`http://localhost:5173/error?message=${status}`)
            }
            if (status === 'success') {
                try {
                    const { data } = await axios.post(process.env.bkash_execute_payment_url, { paymentID }, {
                        headers: {
                            "Content-Type": "application/json",
                            Accept: "application/json",
                            authorization: globals.get('id_token'),
                            'x-app-key': process.env.bkash_api_key,
                        }
                    })
                    if (data && data.statusCode === '0000') {

                        const courseId = globals.get('courseId')
                        const email = globals.get('email')

                        // await paymentCollection.insertOne({
                        //     courseId,
                        //     email,
                        //     userId: Math.random() * 10 + 1,
                        //     paymentID,
                        //     trxID: data.trxID,
                        //     date: data.paymentExecuteTime,
                        //     amount: parseInt(data.amount)
                        // })

                        const result = {
                            courseId,
                            email,
                            userId: Math.random() * 10 + 1,
                            paymentID,
                            trxID: data.trxID,
                            date: data.paymentExecuteTime,
                            amount: parseInt(data.amount)
                        }

                        console.log('courseId', courseId);
                        console.log('result', result);

                        return res.redirect(`http://localhost:5173/success`)

                    } else {
                        return res.redirect(`http://localhost:5173/error?message=${data.statusMessage}`)
                    }

                } catch (error) {
                    console.log(error)
                    return res.redirect(`http://localhost:5173/error?message=${error.message}`)
                }
            }
        })


        // **************************************************************************************************************************
        // ****************************************************PATMENT WITH BKASH END******************************************************

        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

    }
}
run().catch(console.dir);


app.listen(port, () => {
    console.log('Server is running on,', port);
})
