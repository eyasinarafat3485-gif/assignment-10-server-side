import dotenv from 'dotenv'
dotenv.config()
import express from 'express'
import { MongoClient, ObjectId, ServerApiVersion } from 'mongodb'
import cors from 'cors'
import { createRemoteJWKSet, jwtVerify } from 'jose-cjs'

const JWKS = createRemoteJWKSet(
	new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
)

const app = express()
const port = process.env.PORT || 8000

// Middleware
app.use(cors())
app.use(express.json())

// Custom Middleware

const verifyToken = async (req, res, next) => {
	const authHeader = req?.headers.authorization

	if (!authHeader) {
		return res.status(401).json({ message: 'Unauthorized' })
	}
	const token = authHeader.split(' ')[1]
	if (!token) {
		return res.status(401).json({ message: 'Unauthorized' })
	}

	try {
		const { payload } = await jwtVerify(token, JWKS)
		req.decodedEmail = payload.email
		next()
	} catch (error) {
		return res.status(403).json({ message: 'Forbidden' })
	}
}

const logger = (req, res, next) => {
	console.log(req.method, req.path, req.params)
	next()
}

// MongoDB Setup
const uri = process.env.MONGO_DB_URI

const client = new MongoClient(uri, {
	serverApi: {
		version: ServerApiVersion.v1,
		strict: true,
		deprecationErrors: true,
	},
})

async function run() {
	try {
		const database = client.db('blood_Donation_db')
		const bloodRequestsCollection = database.collection('allBloods')
		const usersCollection = database.collection('user')
		const sessionCollection = database.collection('sessions')
		const fundingCollection = database.collection('fundings')

		// ===== USER ROUTES =====

		// Get all users
		app.get('/api/users', async (req, res) => {
			const users = await usersCollection.find({}).toArray()
			res.send(users)
		})

		// Update user status and role
		app.patch('/api/users',  async (req, res) => {
			const { userId, status, role } = req.body

			const updateData = {}

			if (status) {
				updateData.status = status

				if (status.toLowerCase() === 'blocked') {
					updateData.isRestricted = true
				} else if (status.toLowerCase() === 'active') {
					updateData.isRestricted = false
				}
			}

			if (role) {
				updateData.role = role.toLowerCase()
			}

			updateData.updatedAt = new Date()

			const result = await usersCollection.updateOne(
				{ _id: new ObjectId(userId) },
				{ $set: updateData },
			)

			res.send(result)
		})

		// Update user profile
		app.post('/api/user/update',  async (req, res) => {
			try {
				const { id, name, bloodGroup, district, upazila, image } = req.body
        console.log(req.body);

				const filter = { _id: new ObjectId(id) }
				const updateDoc = {
					$set: {
						name,
						bloodGroup,
						district,
						upazila,
						image,
						updatedAt: new Date(),
					},
				}

				const result = await usersCollection.updateOne(filter, updateDoc)

				if (result.modifiedCount > 0) {
					return res.send({
						success: true,
						message: 'User updated successfully',
					})
				}

				return res.send({
					success: false,
					message: 'No changes made or user not found',
				})
			} catch (error) {
				console.log(error)
				res.status(500).send({
					success: false,
					message: 'Server error',
				})
			}
		})

		// Donor Search
		app.get('/api/donors/search', async (req, res) => {
			const { bloodGroup, district, upazila } = req.query

			if (!bloodGroup && !district && !upazila) {
				return res.json({ success: true, data: [] })
			}

			const filter = {}

			if (bloodGroup) {
				filter.bloodGroup = bloodGroup
			}

			if (district) {
				filter.district = { $regex: district, $options: 'i' }
			}

			if (upazila) {
				filter.upazila = { $regex: upazila, $options: 'i' }
			}

			const donors = await usersCollection
				.find(filter)
				.project({ password: 0 })
				.toArray()

			res.json({
				success: true,
				data: donors,
			})
		})

		// ===== BLOOD DONATION REQUEST ROUTES =====

		// Get all pending blood requests (Dashboard)
		app.get('/api/allbloodRequests', async (req, res) => {
			const page = parseInt(req.query.page) || 1
			const limit = parseInt(req.query.limit) || 10
			const skip = (page - 1) * limit

			const filter = { status: 'Pending' }

			const allbloodRequests = await bloodRequestsCollection
				.find(filter)
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limit)
				.toArray()

			const totalRequests = await bloodRequestsCollection.countDocuments(filter)

			res.json({
				success: true,
				requests: allbloodRequests,
				total: totalRequests,
				currentPage: page,
				totalPages: Math.ceil(totalRequests / limit),
			})
		})

		// Get user's blood requests
		app.get('/api/my/bloodRequests', async (req, res) => {
			const userId = req.query.userId

			const page = parseInt(req.query.page) || 1
			const limit = parseInt(req.query.limit) || 10
			const skip = (page - 1) * limit

			if (!userId) {
				return res.status(401).send({ message: 'Unauthorized access' })
			}

			const query = { userId: userId }

			try {
				const totalRequests =
					await bloodRequestsCollection.countDocuments(query)

				const requests = await bloodRequestsCollection
					.find(query)
					.sort({ createdAt: -1 })
					.skip(skip)
					.limit(limit)
					.toArray()

				res.send({ requests, totalRequests })
			} catch (error) {
				res.status(500).send({ message: 'Internal server error', error })
			}
		})

		// Get blood request details
		app.get('/api/bloodRequests/:id',  async (req, res) => {
			console.log('Token From jwtVerify', req.decodedEmail) //Token From jwtVerify hyci@mailinator.com
			const id = req.params.id

			const query = { _id: new ObjectId(id) }

			const result = await bloodRequestsCollection.findOne(query)
			res.send(result)
		})

		// Get all requests with filters (Volunteer & Admin - Same Logic)
		app.get('/api/volunteer/allRequests', async (req, res) => {
			const page = parseInt(req.query.page) || 1
			const limit = parseInt(req.query.limit) || 10
			const skip = (page - 1) * limit

			const { status, search } = req.query
			const filter = {}

			if (status && status !== 'All') {
				if (status === 'InProgress') {
					filter.status = { $regex: /^in\s*progress$/i }
				} else {
					filter.status = status
				}
			}

			if (search && search.trim()) {
				const searchRegex = new RegExp(search.trim(), 'i')
				filter.$or = [
					{ recipientName: searchRegex },
					{ bloodGroup: searchRegex },
					{ district: searchRegex },
					{ upazila: searchRegex },
				]
			}

			const requests = await bloodRequestsCollection
				.find(filter)
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limit)
				.toArray()

			const totalRequests = await bloodRequestsCollection.countDocuments(filter)

			res.json({
				success: true,
				requests,
				totalRequests,
				currentPage: page,
				totalPages: Math.ceil(totalRequests / limit),
			})
		})

		app.get('/api/admin/allRequests', async (req, res) => {
			const page = parseInt(req.query.page) || 1
			const limit = parseInt(req.query.limit) || 10
			const skip = (page - 1) * limit

			const { status, search } = req.query
			const filter = {}

			if (status && status !== 'All') {
				if (status === 'InProgress') {
					filter.status = { $regex: /^in\s*progress$/i }
				} else {
					filter.status = status
				}
			}

			if (search && search.trim()) {
				const searchRegex = new RegExp(search.trim(), 'i')
				filter.$or = [
					{ recipientName: searchRegex },
					{ bloodGroup: searchRegex },
					{ district: searchRegex },
					{ upazila: searchRegex },
				]
			}

			const requests = await bloodRequestsCollection
				.find(filter)
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limit)
				.toArray()

			const totalRequests = await bloodRequestsCollection.countDocuments(filter)

			res.json({
				success: true,
				requests,
				totalRequests,
				currentPage: page,
				totalPages: Math.ceil(totalRequests / limit),
			})
		})

		// Create blood request
		app.post('/api/bloodRequests', async (req, res) => {
			const allBloodRequests = req.body
			const { userId } = allBloodRequests

			if (!userId) {
				return res
					.status(400)
					.send({ success: false, message: 'User ID is required' })
			}

			const user = await usersCollection.findOne({ _id: new ObjectId(userId) })

			if (user && user.isRestricted) {
				return res.status(403).send({
					success: false,
					message:
						'Your account is restricted or blocked. You cannot create a blood request.',
				})
			}

			allBloodRequests.createdAt = new Date()
			const result = await bloodRequestsCollection.insertOne(allBloodRequests)
			res.send(result)
		})

		// Update blood request
		app.patch('/api/bloodRequests/:id',  async (req, res) => {
				const id = req.params.id
				const updateData = req.body

				const filter = { _id: new ObjectId(id) }
				const updateDoc = { $set: updateData }

				try {
					await bloodRequestsCollection.updateOne(filter, updateDoc)
					const updatedDoc = await bloodRequestsCollection.findOne(filter)
					res.send(updatedDoc)
				} catch (error) {
					res
						.status(500)
						.send({ message: 'Failed to update donation request', error })
				}
			},
		)

		// Delete blood request
		app.delete('/api/bloodRequests/:id', async (req, res) => {
			const id = req.params.id
			const query = { _id: new ObjectId(id) }

			const result = await bloodRequestsCollection.deleteOne(query)
			res.send(result)
		})

		// ===== FUNDING ROUTES =====

		// Create funding
		app.post('/api/funding',  async (req, res) => {
			const data = req.body
			const subsInfo = {
				...data,
				createdAt: new Date(),
			}
			const result = await fundingCollection.insertOne(subsInfo)
			res.send(result)
		})

		// Get all fundings
		app.get('/api/funding',  async (req, res) => {
			try {
				const result = await fundingCollection
					.find({})
					.sort({ createdAt: -1 })
					.toArray()
				res.send(result)
			} catch (error) {
				res.status(500).send({ message: 'Failed to fetch funding', error })
			}
		})

		// MongoDB connection check
		await client.db('admin').command({ ping: 1 })
		console.log(
			'Pinged your deployment. You successfully connected to MongoDB!',
		)
	} finally {
	}
}
run().catch(console.dir)

// Health check route
app.get('/', (req, res) => {
	res.send('Hello World, Assignment 10 Server is Running!')
})

app.listen(port, () => {
	console.log(`Example app listening on port ${port}`)
})
