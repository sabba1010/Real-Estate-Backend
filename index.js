

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// Middleware setup
const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
  "https://realest-tau.vercel.app",
  "https://realest-tau.vercel.app/",
  "https://real-ested-hazel.vercel.app",
  "https://real-ested-hazel.vercel.app/",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS origin denied: ${origin}`));
      }
    },
    credentials: true,
  })
);
app.use(express.json());

// Root health check route
app.get("/", (req, res) => {
  res.send("Real Estate API is running");
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djvkmk5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db("realestate");
    const usersCollection = db.collection("users");
    const propertiesCollection = db.collection("properties");
    const reviewsCollection = db.collection("reviews");
    const wishlistCollection = db.collection("wishlists");
    const offersCollection = db.collection("offers");

    // ===== USER ROUTES =====
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        if (!user.email) return res.status(400).json({ error: "Email is required" });

        const existingUser = await usersCollection.findOne({ email: user.email });

        const roleToSet = user.role || existingUser?.role || "user";

        const updateData = {
          name: user.name || existingUser?.name || "",
          email: user.email,
          photoURL: user.photoURL || existingUser?.photoURL || "",
          role: roleToSet,
        };

        const result = await usersCollection.updateOne(
          { email: user.email },
          { $set: updateData },
          { upsert: true }
        );

        res.json({ message: "User saved/updated", role: roleToSet, result });
      } catch (error) {
        console.error("Add/update user error:", error);
        res.status(500).json({ error: "Failed to add/update user" });
      }
    });

    app.get("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        if (!email) return res.status(400).json({ error: "Email is required" });

        const user = await usersCollection.findOne({ email });
        if (!user) return res.json({ role: "user" });

        res.json({ role: user.role });
      } catch (error) {
        console.error("Get user role error:", error);
        res.status(500).json({ error: "Failed to get user role" });
      }
    });

    app.patch("/users/role/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { role } = req.body;

        if (!role) return res.status(400).json({ error: "Role is required" });
        if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid user ID" });

        const allowedRoles = ["user", "admin", "agent", "fraud", "verified"];
        if (!allowedRoles.includes(role)) {
          return res.status(400).json({ error: "Invalid role value" });
        }

        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role } }
        );

        if (result.matchedCount === 0) return res.status(404).json({ error: "User not found" });

        res.json({ message: "User role updated", result });
      } catch (error) {
        console.error("Set user role error:", error);
        res.status(500).json({ error: "Failed to update user role" });
      }
    });

    app.get("/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.json(users);
      } catch (error) {
        console.error("Failed to fetch users", error);
        res.status(500).json({ error: "Failed to fetch users" });
      }
    });

    app.delete("/users/:id", async (req, res) => {
      try {
        const userId = req.params.id;
        if (!ObjectId.isValid(userId)) return res.status(400).json({ error: "Invalid user ID" });

        const result = await usersCollection.deleteOne({ _id: new ObjectId(userId) });
        if (result.deletedCount === 0) return res.status(404).json({ error: "User not found" });

        res.json({ message: "User deleted successfully" });
      } catch (error) {
        console.error("Delete user error:", error);
        res.status(500).json({ error: "Failed to delete user" });
      }
    });

    // ===== PROPERTIES ROUTES =====
    app.get("/properties", async (req, res) => {
      try {
        const { agentEmail } = req.query;
        const query = agentEmail ? { agentEmail } : {};
        const properties = await propertiesCollection.find(query).toArray();
        res.json(properties);
      } catch (error) {
        console.error("Error fetching properties:", error);
        res.status(500).json({ error: "Failed to fetch properties" });
      }
    });

    app.post("/properties", async (req, res) => {
      try {
        const property = req.body;
        if (!property.title || !property.location || !property.priceRange || !property.agentEmail) {
          return res.status(400).json({ error: "Missing required fields" });
        }
        property.createdAt = new Date();

        const result = await propertiesCollection.insertOne(property);
        res.status(201).json(result);
      } catch (error) {
        console.error("Add property error:", error);
        res.status(500).json({ error: "Failed to add property" });
      }
    });

    app.get("/properties/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid property ID format" });

      try {
        const property = await propertiesCollection.findOne({ _id: new ObjectId(id) });
        if (!property) return res.status(404).json({ error: "Property not found" });
        res.json(property);
      } catch (error) {
        console.error("Get property error:", error);
        res.status(500).json({ error: "Failed to get property" });
      }
    });

    app.patch("/properties/:id/status", async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;

      const validStatuses = ["verified", "rejected"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid property ID" });
      }

      try {
        const result = await propertiesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({ message: "Property not found" });
        }

        res.json({ message: "Status updated successfully" });
      } catch (error) {
        console.error("Error updating property status:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.delete("/properties/:id", async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid property ID" });

      try {
        const result = await propertiesCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.status(404).json({ error: "Property not found" });
        res.json({ message: "Property deleted successfully" });
      } catch (error) {
        console.error("Delete property error:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    app.delete("/properties/agent/:agentEmail", async (req, res) => {
      const agentEmail = req.params.agentEmail;

      if (!agentEmail) {
        return res.status(400).json({ error: "Agent email is required" });
      }

      try {
        const result = await propertiesCollection.deleteMany({ agentEmail });

        if (result.deletedCount === 0) {
          return res.status(404).json({ error: "No properties found for this agent" });
        }

        res.json({ message: `Deleted ${result.deletedCount} properties for agent ${agentEmail}` });
      } catch (error) {
        console.error("Failed to delete properties by agent:", error);
        res.status(500).json({ error: "Failed to delete properties" });
      }
    });

    // ===== WISHLIST ROUTES =====
    app.post("/wishlist", async (req, res) => {
      const { userEmail, propertyId } = req.body;
      if (!userEmail || !propertyId) return res.status(400).json({ error: "Missing userEmail or propertyId" });

      if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid propertyId format" });

      try {
        const exists = await wishlistCollection.findOne({
          userEmail,
          propertyId: new ObjectId(propertyId),
        });

        if (exists) return res.status(409).json({ message: "Already in wishlist" });

        const result = await wishlistCollection.insertOne({
          userEmail,
          propertyId: new ObjectId(propertyId),
          createdAt: new Date(),
        });

        res.status(201).json(result);
      } catch (error) {
        console.error("Add to wishlist error:", error);
        res.status(500).json({ error: "Failed to add to wishlist" });
      }
    });

    app.get("/wishlist", async (req, res) => {
      const { userEmail } = req.query;
      if (!userEmail) return res.status(400).json({ error: "Missing userEmail" });

      try {
        const items = await wishlistCollection
          .aggregate([
            { $match: { userEmail } },
            {
              $lookup: {
                from: "properties",
                localField: "propertyId",
                foreignField: "_id",
                as: "property",
              },
            },
            { $unwind: "$property" },
          ])
          .toArray();

        res.json(items);
      } catch (error) {
        console.error("Get wishlist error:", error);
        res.status(500).json({ error: "Failed to get wishlist" });
      }
    });

    app.delete("/wishlist/:id", async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid wishlist item ID" });

      try {
        const result = await wishlistCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.status(404).json({ error: "Wishlist item not found" });
        res.json({ message: "Removed from wishlist" });
      } catch (error) {
        console.error("Delete wishlist error:", error);
        res.status(500).json({ error: "Failed to delete from wishlist" });
      }
    });

    // ===== REQUESTED PROPERTIES (OFFERS FOR AGENT'S PROPERTIES) =====
    app.get("/requested-properties", async (req, res) => {
      try {
        const agentEmail = req.query.agentEmail;
        if (!agentEmail) {
          return res.status(400).json({ error: "agentEmail query parameter is required" });
        }

        const agentProperties = await propertiesCollection
          .find({ agentEmail })
          .project({ _id: 1 })
          .toArray();

        if (!agentProperties.length) {
          return res.json([]);
        }

        const propertyIds = agentProperties.map((p) => p._id);

        const requestedOffers = await offersCollection
          .aggregate([
            { $match: { propertyId: { $in: propertyIds } } },
            {
              $lookup: {
                from: "properties",
                localField: "propertyId",
                foreignField: "_id",
                as: "property",
              },
            },
            { $unwind: "$property" },
          ])
          .toArray();

        res.json(requestedOffers);
      } catch (error) {
        console.error("Failed to fetch requested properties:", error);
        res.status(500).json({ error: "Failed to fetch requested properties" });
      }
    });

    // ===== PATCH route to accept/reject/pay offers (for requested-properties) =====
    app.patch("/requested-properties/:offerId", async (req, res) => {
      const { offerId } = req.params;
      const { status, propertyId } = req.body;

      if (!["accepted", "rejected", "paid"].includes(status)) {
        return res.status(400).json({ success: false, message: "Invalid status value" });
      }
      if (!ObjectId.isValid(offerId)) {
        return res.status(400).json({ success: false, message: "Invalid offer ID" });
      }
      if (!ObjectId.isValid(propertyId)) {
        return res.status(400).json({ success: false, message: "Invalid property ID" });
      }

      try {
        const updateResult = await offersCollection.updateOne(
          { _id: new ObjectId(offerId) },
          { $set: { status } }
        );

        if (updateResult.matchedCount === 0) {
          return res.status(404).json({ success: false, message: "Offer not found" });
        }

        if (status === "accepted") {
          await offersCollection.updateMany(
            {
              propertyId: new ObjectId(propertyId),
              _id: { $ne: new ObjectId(offerId) },
              status: "pending",
            },
            { $set: { status: "rejected" } }
          );
        }

        res.json({ success: true, message: `Offer ${status} successfully updated` });
      } catch (error) {
        console.error("Error updating offer status:", error);
        res.status(500).json({ success: false, message: "Server error" });
      }
    });

    // ===== REVIEWS ROUTES =====
// Fetch property by ID with agent name
app.get("/properties/:id", async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid property ID format" });

  try {
    const property = await propertiesCollection
      .aggregate([
        { $match: { _id: new ObjectId(id) } },
        {
          $lookup: {
            from: "users",
            localField: "agentEmail",
            foreignField: "email",
            as: "agent",
          },
        },
        { $unwind: { path: "$agent", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            title: 1,
            location: 1,
            priceRange: 1,
            description: 1,
            image: 1,
            status: 1,
            agentEmail: 1,
            createdAt: 1,
            agentName: { $ifNull: ["$agent.name", "Unknown"] },
          },
        },
      ])
      .toArray();

    if (!property.length) return res.status(404).json({ error: "Property not found" });
    res.json(property[0]);
  } catch (error) {
    console.error("Get property error:", error);
    res.status(500).json({ error: "Failed to get property" });
  }
});

// Add a review for a property with propertyTitle and agentName
app.post("/properties/:id/reviews", async (req, res) => {
  const propertyId = req.params.id;
  const { userEmail, comment } = req.body;

  if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid property ID" });
  if (!userEmail || !comment) return res.status(400).json({ error: "Missing review fields" });

  try {
    // Fetch property to get title and agentEmail
    const property = await propertiesCollection.findOne({ _id: new ObjectId(propertyId) });
    if (!property) return res.status(404).json({ error: "Property not found" });

    // Fetch agent name from users collection
    const agent = await usersCollection.findOne({ email: property.agentEmail });
    const review = {
      userEmail,
      comment,
      propertyId,
      propertyTitle: property.title || "Unknown",
      agentName: agent ? agent.name : "Unknown",
      createdAt: new Date(),
    };

    const result = await reviewsCollection.insertOne(review);
    res.status(201).json(result);
  } catch (error) {
    console.error("Add review error:", error);
    res.status(500).json({ error: "Failed to add review" });
  }
});

// Fetch reviews for a property with propertyTitle, agentName, and reviewer name
app.get("/properties/:id/reviews", async (req, res) => {
  const propertyId = req.params.id;
  if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid property ID" });

  try {
    const reviews = await reviewsCollection
      .aggregate([
        { $match: { propertyId } },
        {
          $lookup: {
            from: "users",
            localField: "userEmail",
            foreignField: "email",
            as: "user",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            userEmail: 1,
            comment: 1,
            createdAt: 1,
            propertyId: 1,
            propertyTitle: 1,
            agentName: 1,
            name: { $ifNull: ["$user.name", "Anonymous"] },
          },
        },
      ])
      .toArray();

    res.json(reviews);
  } catch (error) {
    console.error("Get reviews error:", error);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});



    
    app.get("/reviews/user/:email", async (req, res) => {
      const email = req.params.email;
      try {
        const reviews = await reviewsCollection.find({ userEmail: email }).toArray();
        if (!reviews.length) return res.status(404).json({ message: "No reviews found for this user" });
        res.json(reviews);
      } catch (error) {
        console.error("Error fetching user reviews:", error);
        res.status(500).json({ error: "Failed to get user reviews" });
      }
    });

    app.delete("/reviews/:id", async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid review ID" });

      try {
        const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.status(404).json({ message: "Review not found" });
        res.json({ success: true, message: "Review deleted successfully" });
      } catch (error) {
        console.error("Delete review error:", error);
        res.status(500).json({ error: "Failed to delete review" });
      }
    });

    app.get("/properties/:id/reviews", async (req, res) => {
      const propertyId = req.params.id;
      if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid property ID" });

      try {
        const reviews = await reviewsCollection.find({ propertyId }).toArray();
        res.json(reviews);
      } catch (error) {
        console.error("Get reviews error:", error);
        res.status(500).json({ error: "Failed to fetch reviews" });
      }
    });

    app.post("/properties/:id/reviews", async (req, res) => {
      const propertyId = req.params.id;
      const review = req.body;

      if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid property ID" });
      if (!review.userEmail || !review.comment) return res.status(400).json({ error: "Missing review fields" });

      review.propertyId = propertyId;
      review.createdAt = new Date();

      try {
        const result = await reviewsCollection.insertOne(review);
        res.status(201).json(result);
      } catch (error) {
        console.error("Add review error:", error);
        res.status(500).json({ error: "Failed to add review" });
      }
    });

    app.get("/reviews/latest", async (req, res) => {
      try {
        const latestReviews = await reviewsCollection
          .aggregate([
            { $sort: { createdAt: -1 } },
            { $limit: 3 },
            {
              $lookup: {
                from: "users",
                localField: "userEmail",
                foreignField: "email",
                as: "user",
              },
            },
            { $unwind: "$user" },
            {
              $addFields: {
                propertyObjectId: { $toObjectId: "$propertyId" },
              },
            },
            {
              $lookup: {
                from: "properties",
                localField: "propertyObjectId",
                foreignField: "_id",
                as: "property",
              },
            },
            { $unwind: "$property" },
            {
              $project: {
                _id: 1,
                comment: 1,
                createdAt: 1,
                "user.name": 1,
                "user.photoURL": 1,
                "property.title": 1,
              },
            },
          ])
          .toArray();

        res.json(latestReviews);
      } catch (error) {
        console.error("Failed to get latest reviews:", error);
        res.status(500).json({ error: "Failed to get latest reviews" });
      }
    });

app.get("/reviews", async (req, res) => {
      try {
        const reviews = await reviewsCollection
          .aggregate([
            {
              $lookup: {
                from: "users",
                localField: "userEmail",
                foreignField: "email",
                as: "user",
              },
            },
            { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
            {
              $project: {
                _id: 1,
                userEmail: 1,
                comment: 1,
                createdAt: 1,
                propertyId: 1,
                name: { $ifNull: ["$user.name", "Anonymous"] },
                photoURL: { $ifNull: ["$user.photoURL", "/default-avatar.png"] },
                email: { $ifNull: ["$user.email", "No email"] },
              },
            },
          ])
          .toArray();

        res.json(reviews);
      } catch (error) {
        console.error("Error fetching reviews:", error);
        res.status(500).json({ error: "Failed to fetch reviews" });
      }
    });

    // Delete a review by ID
    app.delete("/reviews/:id", async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid review ID" });

      try {
        const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
          return res.status(404).json({ error: "Review not found" });
        }
        res.json({ deletedCount: result.deletedCount });
      } catch (error) {
        console.error("Delete review error:", error);
        res.status(500).json({ error: "Failed to delete review" });
      }
    });

    // Fetch reviews for a specific user
    app.get("/reviews/user/:email", async (req, res) => {
      const email = req.params.email;
      try {
        const reviews = await reviewsCollection.find({ userEmail: email }).toArray();
        if (!reviews.length) return res.status(404).json({ message: "No reviews found for this user" });
        res.json(reviews);
      } catch (error) {
        console.error("Error fetching user reviews:", error);
        res.status(500).json({ error: "Failed to get user reviews" });
      }
    });

    // Fetch reviews for a specific property
    app.get("/properties/:id/reviews", async (req, res) => {
      const propertyId = req.params.id;
      if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid property ID" });

      try {
        const reviews = await reviewsCollection.find({ propertyId }).toArray();
        res.json(reviews);
      } catch (error) {
        console.error("Get reviews error:", error);
        res.status(500).json({ error: "Failed to fetch reviews" });
      }
    });

    // Add a review for a property
    app.post("/properties/:id/reviews", async (req, res) => {
      const propertyId = req.params.id;
      const review = req.body;

      if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid property ID" });
      if (!review.userEmail || !review.comment) return res.status(400).json({ error: "Missing review fields" });

      review.propertyId = propertyId;
      review.createdAt = new Date();

      try {
        const result = await reviewsCollection.insertOne(review);
        res.status(201).json(result);
      } catch (error) {
        console.error("Add review error:", error);
        res.status(500).json({ error: "Failed to add review" });
      }
    });

    // Fetch latest reviews with user and property data
    app.get("/reviews/latest", async (req, res) => {
      try {
        const latestReviews = await reviewsCollection
          .aggregate([
            { $sort: { createdAt: -1 } },
            { $limit: 3 },
            {
              $lookup: {
                from: "users",
                localField: "userEmail",
                foreignField: "email",
                as: "user",
              },
            },
            { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
            {
              $addFields: {
                propertyObjectId: { $toObjectId: "$propertyId" },
              },
            },
            {
              $lookup: {
                from: "properties",
                localField: "propertyObjectId",
                foreignField: "_id",
                as: "property",
              },
            },
            { $unwind: { path: "$property", preserveNullAndEmptyArrays: true } },
            {
              $project: {
                _id: 1,
                comment: 1,
                createdAt: 1,
                "user.name": 1,
                "user.photoURL": 1,
                "property.title": 1,
              },
            },
          ])
          .toArray();

        res.json(latestReviews);
      } catch (error) {
        console.error("Failed to get latest reviews:", error);
        res.status(500).json({ error: "Failed to get latest reviews" });
      }
    });


    
    // ===== OFFERS ROUTES =====
    app.post("/offers", async (req, res) => {
      try {
        const offer = req.body;
        if (!offer.userEmail || !offer.propertyId || !offer.offerPrice)
          return res.status(400).json({ success: false, error: "Missing required fields" });

        if (typeof offer.propertyId === "string" && ObjectId.isValid(offer.propertyId)) {
          offer.propertyId = new ObjectId(offer.propertyId);
        } else if (!(offer.propertyId instanceof ObjectId)) {
          return res.status(400).json({ error: "Invalid propertyId format" });
        }

        // Prevent duplicate offers from the same user for the same property.
        const existingOffer = await offersCollection.findOne({
          userEmail: offer.userEmail,
          propertyId: offer.propertyId,
          buyingDate: offer.buyingDate,
        });

        if (existingOffer) {
          return res.status(409).json({ success: false, error: "You already submitted an offer for this property on that date." });
        }

        offer.createdAt = new Date();

        const result = await offersCollection.insertOne(offer);
        res.status(201).json({ success: true, insertedId: result.insertedId });
      } catch (error) {
        console.error("Add offer error:", error);
        res.status(500).json({ success: false, error: "Failed to add offer" });
      }
    });

    // ===== PAYMENT ROUTES =====
    app.post("/create-payment-intent", async (req, res) => {
      const { amount } = req.body;
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(amount * 100), // amount in cents
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        console.error("Payment intent error:", error);
        res.status(500).send({ error: error.message });
      }
    });

    // (Optional) Checkout session route if needed by MyOffer.jsx
    app.post("/create-checkout-session", async (req, res) => {
      const { offerId, amount } = req.body;
      try {
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: { name: "Property Offer Payment" },
                unit_amount: Math.round(amount * 100),
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url: `${process.env.CLIENT_URL || "http://localhost:5173"}/dashboard/offer?session_id={CHECKOUT_SESSION_ID}&offer_id=${offerId}&amount=${amount}`,
          cancel_url: `${process.env.CLIENT_URL || "http://localhost:5173"}/dashboard/offer`,
        });
        res.json({ url: session.url });
      } catch (error) {
        console.error("Checkout session error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    app.get("/offers", async (req, res) => {
      const userEmail = req.query.email;
      if (!userEmail) return res.status(400).json({ error: "Missing userEmail query param" });

      try {
        const offers = await offersCollection
          .aggregate([
            { $match: { userEmail } },
            {
              $lookup: {
                from: "properties",
                localField: "propertyId",
                foreignField: "_id",
                as: "property",
              },
            },
            { $unwind: "$property" },
          ])
          .toArray();

        res.json(offers);
      } catch (error) {
        console.error("Get offers error:", error);
        res.status(500).json({ error: "Failed to get offers" });
      }
    });


    
    // ===== DELETE OFFER ROUTE =====
    app.delete("/offers/:id", async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid offer ID" });

      try {
        const result = await offersCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.status(404).json({ error: "Offer not found" });
        res.json({ message: "Offer deleted successfully" });
      } catch (error) {
        console.error("Delete offer error:", error);
        res.status(500).json({ error: "Failed to delete offer" });
      }
    });

    if (!process.env.VERCEL) {
      // Global 404 handler for API
      app.use((req, res) => {
        res.status(404).json({ error: "API Route not found" });
      });

      app.listen(port, () => {
        console.log(`Server running on port ${port}`);
      });
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

const readyPromise = run();

module.exports = async (req, res) => {
  try {
    await readyPromise;
    return app(req, res);
  } catch (err) {
    console.error("Server initialization failed:", err);
    res.statusCode = 500;
    return res.end("Internal Server Error");
  }
};

// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// dotenv.config();

// const app = express();
// const port = process.env.PORT || 5000;

// // Middleware setup
// app.use(
//   cors({
//     origin: "http://localhost:5173", // Update this for production
//     credentials: true,
//   })
// );
// app.use(express.json());

// // Root health check route
// app.get("/", (req, res) => {
//   res.send("Real Estate API is running");
// });

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djvkmk5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// async function run() {
//   try {
//     await client.connect();
//     console.log("✅ Connected to MongoDB");

//     const db = client.db("realestate");
//     const usersCollection = db.collection("users");
//     const propertiesCollection = db.collection("properties");
//     const reviewsCollection = db.collection("reviews");
//     const wishlistCollection = db.collection("wishlists");
//     const offersCollection = db.collection("offers");

//     // ===== USER ROUTES =====
//     app.post("/users", async (req, res) => {
//       try {
//         const user = req.body;
//         if (!user.email) return res.status(400).json({ error: "Email is required" });

//         const existingUser = await usersCollection.findOne({ email: user.email });

//         const roleToSet = user.role || existingUser?.role || "user";

//         const updateData = {
//           name: user.name || existingUser?.name || "",
//           email: user.email,
//           photoURL: user.photoURL || existingUser?.photoURL || "",
//           role: roleToSet,
//         };

//         const result = await usersCollection.updateOne(
//           { email: user.email },
//           { $set: updateData },
//           { upsert: true }
//         );

//         res.json({ message: "User saved/updated", role: roleToSet, result });
//       } catch (error) {
//         console.error("Add/update user error:", error);
//         res.status(500).json({ error: "Failed to add/update user" });
//       }
//     });

//     app.get("/users/:email", async (req, res) => {
//       try {
//         const email = req.params.email;
//         if (!email) return res.status(400).json({ error: "Email is required" });

//         const user = await usersCollection.findOne({ email });
//         if (!user) return res.json({ role: "user" });

//         res.json({ role: user.role });
//       } catch (error) {
//         console.error("Get user role error:", error);
//         res.status(500).json({ error: "Failed to get user role" });
//       }
//     });

//     app.patch("/users/role/:id", async (req, res) => {
//       try {
//         const id = req.params.id;
//         const { role } = req.body;

//         if (!role) return res.status(400).json({ error: "Role is required" });
//         if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid user ID" });

//         const allowedRoles = ["user", "admin", "agent", "fraud", "verified"];
//         if (!allowedRoles.includes(role)) {
//           return res.status(400).json({ error: "Invalid role value" });
//         }

//         const result = await usersCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { role } }
//         );

//         if (result.matchedCount === 0) return res.status(404).json({ error: "User not found" });

//         res.json({ message: "User role updated", result });
//       } catch (error) {
//         console.error("Set user role error:", error);
//         res.status(500).json({ error: "Failed to update user role" });
//       }
//     });

//     app.get("/users", async (req, res) => {
//       try {
//         const users = await usersCollection.find().toArray();
//         res.json(users);
//       } catch (error) {
//         console.error("Failed to fetch users", error);
//         res.status(500).json({ error: "Failed to fetch users" });
//       }
//     });

//     app.delete("/users/:id", async (req, res) => {
//       try {
//         const userId = req.params.id;
//         if (!ObjectId.isValid(userId)) return res.status(400).json({ error: "Invalid user ID" });

//         const result = await usersCollection.deleteOne({ _id: new ObjectId(userId) });
//         if (result.deletedCount === 0) return res.status(404).json({ error: "User not found" });

//         res.json({ message: "User deleted successfully" });
//       } catch (error) {
//         console.error("Delete user error:", error);
//         res.status(500).json({ error: "Failed to delete user" });
//       }
//     });

//     // ===== PROPERTIES ROUTES =====
//     app.get("/properties", async (req, res) => {
//       try {
//         const { agentEmail } = req.query;
//         const query = agentEmail ? { agentEmail } : {};
//         const properties = await propertiesCollection.find(query).toArray();
//         res.json(properties);
//       } catch (error) {
//         console.error("Error fetching properties:", error);
//         res.status(500).json({ error: "Failed to fetch properties" });
//       }
//     });

//     app.post("/properties", async (req, res) => {
//       try {
//         const property = req.body;
//         if (!property.title || !property.location || !property.priceRange || !property.agentEmail) {
//           return res.status(400).json({ error: "Missing required fields" });
//         }
//         property.createdAt = new Date();

//         const result = await propertiesCollection.insertOne(property);
//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add property error:", error);
//         res.status(500).json({ error: "Failed to add property" });
//       }
//     });

//     app.get("/properties/:id", async (req, res) => {
//       const { id } = req.params;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid property ID format" });

//       try {
//         const property = await propertiesCollection.findOne({ _id: new ObjectId(id) });
//         if (!property) return res.status(404).json({ error: "Property not found" });
//         res.json(property);
//       } catch (error) {
//         console.error("Get property error:", error);
//         res.status(500).json({ error: "Failed to get property" });
//       }
//     });

//     app.patch("/properties/:id/status", async (req, res) => {
//       const { id } = req.params;
//       const { status } = req.body;

//       const validStatuses = ["verified", "rejected"];
//       if (!validStatuses.includes(status)) {
//         return res.status(400).json({ message: "Invalid status" });
//       }

//       if (!ObjectId.isValid(id)) {
//         return res.status(400).json({ message: "Invalid property ID" });
//       }

//       try {
//         const result = await propertiesCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { status } }
//         );

//         if (result.modifiedCount === 0) {
//           return res.status(404).json({ message: "Property not found" });
//         }

//         res.json({ message: "Status updated successfully" });
//       } catch (error) {
//         console.error("Error updating property status:", error);
//         res.status(500).json({ message: "Internal server error" });
//       }
//     });

//     app.delete("/properties/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid property ID" });

//       try {
//         const result = await propertiesCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).json({ error: "Property not found" });
//         res.json({ message: "Property deleted successfully" });
//       } catch (error) {
//         console.error("Delete property error:", error);
//         res.status(500).json({ error: "Internal server error" });
//       }
//     });

//     app.delete("/properties/agent/:agentEmail", async (req, res) => {
//       const agentEmail = req.params.agentEmail;

//       if (!agentEmail) {
//         return res.status(400).json({ error: "Agent email is required" });
//       }

//       try {
//         const result = await propertiesCollection.deleteMany({ agentEmail });

//         if (result.deletedCount === 0) {
//           return res.status(404).json({ error: "No properties found for this agent" });
//         }

//         res.json({ message: `Deleted ${result.deletedCount} properties for agent ${agentEmail}` });
//       } catch (error) {
//         console.error("Failed to delete properties by agent:", error);
//         res.status(500).json({ error: "Failed to delete properties" });
//       }
//     });

//     // ===== WISHLIST ROUTES =====
//     app.post("/wishlist", async (req, res) => {
//       const { userEmail, propertyId } = req.body;
//       if (!userEmail || !propertyId) return res.status(400).json({ error: "Missing userEmail or propertyId" });

//       if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid propertyId format" });

//       try {
//         const exists = await wishlistCollection.findOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//         });

//         if (exists) return res.status(409).json({ message: "Already in wishlist" });

//         const result = await wishlistCollection.insertOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//           createdAt: new Date(),
//         });

//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add to wishlist error:", error);
//         res.status(500).json({ error: "Failed to add to wishlist" });
//       }
//     });

//     app.get("/wishlist", async (req, res) => {
//       const { userEmail } = req.query;
//       if (!userEmail) return res.status(400).json({ error: "Missing userEmail" });

//       try {
//         const items = await wishlistCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//           ])
//           .toArray();

//         res.json(items);
//       } catch (error) {
//         console.error("Get wishlist error:", error);
//         res.status(500).json({ error: "Failed to get wishlist" });
//       }
//     });

//     app.delete("/wishlist/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid wishlist item ID" });

//       try {
//         const result = await wishlistCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).json({ error: "Wishlist item not found" });
//         res.json({ message: "Removed from wishlist" });
//       } catch (error) {
//         console.error("Delete wishlist error:", error);
//         res.status(500).json({ error: "Failed to delete from wishlist" });
//       }
//     });

//     // ===== REQUESTED PROPERTIES (OFFERS FOR AGENT'S PROPERTIES) =====
//     app.get("/requested-properties", async (req, res) => {
//       try {
//         const agentEmail = req.query.agentEmail;
//         if (!agentEmail) {
//           return res.status(400).json({ error: "agentEmail query parameter is required" });
//         }

//         const agentProperties = await propertiesCollection
//           .find({ agentEmail })
//           .project({ _id: 1 })
//           .toArray();

//         if (!agentProperties.length) {
//           return res.json([]);
//         }

//         const propertyIds = agentProperties.map((p) => p._id);

//         const requestedOffers = await offersCollection
//           .aggregate([
//             { $match: { propertyId: { $in: propertyIds } } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//           ])
//           .toArray();

//         res.json(requestedOffers);
//       } catch (error) {
//         console.error("Failed to fetch requested properties:", error);
//         res.status(500).json({ error: "Failed to fetch requested properties" });
//       }
//     });

//     // ===== PATCH route to accept/reject offers (for requested-properties) =====
//     app.patch("/requested-properties/:offerId", async (req, res) => {
//       const { offerId } = req.params;
//       const { status, propertyId } = req.body;

//       if (!["accepted", "rejected"].includes(status)) {
//         return res.status(400).json({ success: false, message: "Invalid status value" });
//       }
//       if (!ObjectId.isValid(offerId)) {
//         return res.status(400).json({ success: false, message: "Invalid offer ID" });
//       }
//       if (!ObjectId.isValid(propertyId)) {
//         return res.status(400).json({ success: false, message: "Invalid property ID" });
//       }

//       try {
//         const updateResult = await offersCollection.updateOne(
//           { _id: new ObjectId(offerId) },
//           { $set: { status } }
//         );

//         if (updateResult.matchedCount === 0) {
//           return res.status(404).json({ success: false, message: "Offer not found" });
//         }

//         if (status === "accepted") {
//           await offersCollection.updateMany(
//             {
//               propertyId: new ObjectId(propertyId),
//               _id: { $ne: new ObjectId(offerId) },
//               status: "pending",
//             },
//             { $set: { status: "rejected" } }
//           );
//         }

//         res.json({ success: true, message: `Offer ${status} successfully updated` });
//       } catch (error) {
//         console.error("Error updating offer status:", error);
//         res.status(500).json({ success: false, message: "Server error" });
//       }
//     });

//     // ===== REVIEWS ROUTES =====
//     app.get("/reviews/user/:email", async (req, res) => {
//       const email = req.params.email;
//       try {
//         const reviews = await reviewsCollection.find({ userEmail: email }).toArray();
//         if (!reviews.length) return res.status(404).json({ message: "No reviews found for this user" });
//         res.json(reviews);
//       } catch (error) {
//         console.error("Error fetching user reviews:", error);
//         res.status(500).json({ error: "Failed to get user reviews" });
//       }
//     });

//     app.delete("/reviews/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid review ID" });

//       try {
//         const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).json({ message: "Review not found" });
//         res.json({ success: true, message: "Review deleted successfully" });
//       } catch (error) {
//         console.error("Delete review error:", error);
//         res.status(500).json({ error: "Failed to delete review" });
//       }
//     });

//     app.get("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid property ID" });

//       try {
//         const reviews = await reviewsCollection.find({ propertyId }).toArray();
//         res.json(reviews);
//       } catch (error) {
//         console.error("Get reviews error:", error);
//         res.status(500).json({ error: "Failed to fetch reviews" });
//       }
//     });

//     app.post("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       const review = req.body;

//       if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid property ID" });
//       if (!review.userEmail || !review.comment) return res.status(400).json({ error: "Missing review fields" });

//       review.propertyId = propertyId;
//       review.createdAt = new Date();

//       try {
//         const result = await reviewsCollection.insertOne(review);
//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add review error:", error);
//         res.status(500).json({ error: "Failed to add review" });
//       }
//     });

//     app.get("/reviews/latest", async (req, res) => {
//       try {
//         const latestReviews = await reviewsCollection
//           .aggregate([
//             { $sort: { createdAt: -1 } },
//             { $limit: 3 },
//             {
//               $lookup: {
//                 from: "users",
//                 localField: "userEmail",
//                 foreignField: "email",
//                 as: "user",
//               },
//             },
//             { $unwind: "$user" },
//             {
//               $addFields: {
//                 propertyObjectId: { $toObjectId: "$propertyId" },
//               },
//             },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyObjectId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//             {
//               $project: {
//                 _id: 1,
//                 comment: 1,
//                 createdAt: 1,
//                 "user.name": 1,
//                 "user.photoURL": 1,
//                 "property.title": 1,
//               },
//             },
//           ])
//           .toArray();

//         res.json(latestReviews);
//       } catch (error) {
//         console.error("Failed to get latest reviews:", error);
//         res.status(500).json({ error: "Failed to get latest reviews" });
//       }
//     });

//     // ===== OFFERS ROUTES =====
//     app.post("/offers", async (req, res) => {
//       try {
//         const offer = req.body;
//         if (!offer.userEmail || !offer.propertyId || !offer.offerPrice)
//           return res.status(400).json({ success: false, error: "Missing required fields" });

//         offer.createdAt = new Date();

//         if (typeof offer.propertyId === "string" && ObjectId.isValid(offer.propertyId)) {
//           offer.propertyId = new ObjectId(offer.propertyId);
//         } else if (!(offer.propertyId instanceof ObjectId)) {
//           return res.status(400).json({ error: "Invalid propertyId format" });
//         }

//         const result = await offersCollection.insertOne(offer);
//         res.status(201).json({ success: true, insertedId: result.insertedId });
//       } catch (error) {
//         console.error("Add offer error:", error);
//         res.status(500).json({ success: false, error: "Failed to add offer" });
//       }
//     });

//     app.get("/offers", async (req, res) => {
//       const userEmail = req.query.email;
//       if (!userEmail) return res.status(400).json({ error: "Missing userEmail query param" });

//       try {
//         const offers = await offersCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//           ])
//           .toArray();

//         res.json(offers);
//       } catch (error) {
//         console.error("Get offers error:", error);
//         res.status(500).json({ error: "Failed to get offers" });
//       }
//     });

//     app.listen(port, () => {
//       console.log(`Server running on port ${port}`);
//     });
//   } catch (err) {
//     console.error(err);
//     process.exit(1);
//   }
// }

// run();


// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// dotenv.config();

// const app = express();
// const port = process.env.PORT || 5000;

// // Middleware setup
// app.use(
//   cors({
//     origin: "http://localhost:5173", // Update this for production
//     credentials: true,
//   })
// );
// app.use(express.json());

// // Root health check route
// app.get("/", (req, res) => {
//   res.send("Real Estate API is running");
// });

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djvkmk5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// async function run() {
//   try {
//     await client.connect();
//     console.log("✅ Connected to MongoDB");

//     const db = client.db("realestate");
//     const usersCollection = db.collection("users");
//     const propertiesCollection = db.collection("properties");
//     const reviewsCollection = db.collection("reviews");
//     const wishlistCollection = db.collection("wishlists");
//     const offersCollection = db.collection("offers");

//     // ===== USER ROUTES =====
//     app.post("/users", async (req, res) => {
//       try {
//         const user = req.body;
//         if (!user.email) return res.status(400).json({ error: "Email is required" });

//         const existingUser = await usersCollection.findOne({ email: user.email });

//         const roleToSet = user.role || existingUser?.role || "user";

//         const updateData = {
//           name: user.name || existingUser?.name || "",
//           email: user.email,
//           photoURL: user.photoURL || existingUser?.photoURL || "",
//           role: roleToSet,
//         };

//         const result = await usersCollection.updateOne(
//           { email: user.email },
//           { $set: updateData },
//           { upsert: true }
//         );

//         res.json({ message: "User saved/updated", role: roleToSet, result });
//       } catch (error) {
//         console.error("Add/update user error:", error);
//         res.status(500).json({ error: "Failed to add/update user" });
//       }
//     });

//     app.get("/users/:email", async (req, res) => {
//       try {
//         const email = req.params.email;
//         if (!email) return res.status(400).json({ error: "Email is required" });

//         const user = await usersCollection.findOne({ email });
//         if (!user) return res.json({ role: "user" });

//         res.json({ role: user.role });
//       } catch (error) {
//         console.error("Get user role error:", error);
//         res.status(500).json({ error: "Failed to get user role" });
//       }
//     });

//     app.patch("/users/role/:id", async (req, res) => {
//       try {
//         const id = req.params.id;
//         const { role } = req.body;

//         if (!role) return res.status(400).json({ error: "Role is required" });
//         if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid user ID" });

//         const allowedRoles = ["user", "admin", "agent", "fraud", "verified"];
//         if (!allowedRoles.includes(role)) {
//           return res.status(400).json({ error: "Invalid role value" });
//         }

//         const result = await usersCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { role } }
//         );

//         if (result.matchedCount === 0) return res.status(404).json({ error: "User not found" });

//         res.json({ message: "User role updated", result });
//       } catch (error) {
//         console.error("Set user role error:", error);
//         res.status(500).json({ error: "Failed to update user role" });
//       }
//     });

//     app.get("/users", async (req, res) => {
//       try {
//         const users = await usersCollection.find().toArray();
//         res.json(users);
//       } catch (error) {
//         console.error("Failed to fetch users", error);
//         res.status(500).json({ error: "Failed to fetch users" });
//       }
//     });

//     app.delete("/users/:id", async (req, res) => {
//       try {
//         const userId = req.params.id;
//         if (!ObjectId.isValid(userId)) return res.status(400).json({ error: "Invalid user ID" });

//         const result = await usersCollection.deleteOne({ _id: new ObjectId(userId) });
//         if (result.deletedCount === 0) return res.status(404).json({ error: "User not found" });

//         res.json({ message: "User deleted successfully" });
//       } catch (error) {
//         console.error("Delete user error:", error);
//         res.status(500).json({ error: "Failed to delete user" });
//       }
//     });

//     // ===== PROPERTIES ROUTES =====
//     app.get("/properties", async (req, res) => {
//       try {
//         const { agentEmail } = req.query;
//         const query = agentEmail ? { agentEmail } : {};
//         const properties = await propertiesCollection.find(query).toArray();
//         res.json(properties);
//       } catch (error) {
//         console.error("Error fetching properties:", error);
//         res.status(500).json({ error: "Failed to fetch properties" });
//       }
//     });

//     app.post("/properties", async (req, res) => {
//       try {
//         const property = req.body;
//         if (!property.title || !property.location || !property.priceRange || !property.agentEmail) {
//           return res.status(400).json({ error: "Missing required fields" });
//         }
//         property.createdAt = new Date();

//         const result = await propertiesCollection.insertOne(property);
//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add property error:", error);
//         res.status(500).json({ error: "Failed to add property" });
//       }
//     });

//     app.get("/properties/:id", async (req, res) => {
//       const { id } = req.params;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid property ID format" });

//       try {
//         const property = await propertiesCollection.findOne({ _id: new ObjectId(id) });
//         if (!property) return res.status(404).json({ error: "Property not found" });
//         res.json(property);
//       } catch (error) {
//         console.error("Get property error:", error);
//         res.status(500).json({ error: "Failed to get property" });
//       }
//     });

//     app.patch("/properties/:id/status", async (req, res) => {
//       const { id } = req.params;
//       const { status } = req.body;

//       const validStatuses = ["verified", "rejected"];
//       if (!validStatuses.includes(status)) {
//         return res.status(400).json({ message: "Invalid status" });
//       }

//       if (!ObjectId.isValid(id)) {
//         return res.status(400).json({ message: "Invalid property ID" });
//       }

//       try {
//         const result = await propertiesCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { status } }
//         );

//         if (result.modifiedCount === 1) {
//           res.json({ message: "Status updated successfully" });
//         } else {
//           res.status(404).json({ message: "Property not found" });
//         }
//       } catch (error) {
//         console.error("Error updating property status:", error);
//         res.status(500).json({ message: "Internal server error" });
//       }
//     });

//     app.delete("/properties/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid property ID" });

//       try {
//         const result = await propertiesCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).json({ error: "Property not found" });
//         res.json({ message: "Property deleted successfully" });
//       } catch (error) {
//         console.error("Delete property error:", error);
//         res.status(500).json({ error: "Internal server error" });
//       }
//     });

//     // DELETE ALL PROPERTIES OF AN AGENT BY EMAIL
//     app.delete("/properties/agent/:agentEmail", async (req, res) => {
//       const agentEmail = req.params.agentEmail;

//       if (!agentEmail) {
//         return res.status(400).json({ error: "Agent email is required" });
//       }

//       try {
//         const result = await propertiesCollection.deleteMany({ agentEmail: agentEmail });

//         if (result.deletedCount === 0) {
//           return res.status(404).json({ error: "No properties found for this agent" });
//         }

//         res.json({ message: `Deleted ${result.deletedCount} properties for agent ${agentEmail}` });
//       } catch (error) {
//         console.error("Failed to delete properties by agent:", error);
//         res.status(500).json({ error: "Failed to delete properties" });
//       }
//     });

//     // ===== WISHLIST ROUTES =====
//     app.post("/wishlist", async (req, res) => {
//       const { userEmail, propertyId } = req.body;
//       if (!userEmail || !propertyId) return res.status(400).json({ error: "Missing userEmail or propertyId" });

//       if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid propertyId format" });

//       try {
//         const exists = await wishlistCollection.findOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//         });

//         if (exists) return res.status(409).json({ message: "Already in wishlist" });

//         const result = await wishlistCollection.insertOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//           createdAt: new Date(),
//         });

//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add to wishlist error:", error);
//         res.status(500).json({ error: "Failed to add to wishlist" });
//       }
//     });

//     app.get("/wishlist", async (req, res) => {
//       const { userEmail } = req.query;
//       if (!userEmail) return res.status(400).json({ error: "Missing userEmail" });

//       try {
//         const items = await wishlistCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//           ])
//           .toArray();

//         res.json(items);
//       } catch (error) {
//         console.error("Get wishlist error:", error);
//         res.status(500).json({ error: "Failed to get wishlist" });
//       }
//     });

//     app.delete("/wishlist/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid wishlist item ID" });

//       try {
//         const result = await wishlistCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).json({ error: "Wishlist item not found" });
//         res.json({ message: "Removed from wishlist" });
//       } catch (error) {
//         console.error("Delete wishlist error:", error);
//         res.status(500).json({ error: "Failed to delete from wishlist" });
//       }
//     });

//     // ===== REQUESTED PROPERTIES (OFFERS FOR AGENT'S PROPERTIES) =====
//     app.get("/requested-properties", async (req, res) => {
//       try {
//         const agentEmail = req.query.agentEmail;
//         if (!agentEmail) {
//           return res.status(400).json({ error: "agentEmail query parameter is required" });
//         }

//         // Find properties for this agent
//         const agentProperties = await propertiesCollection
//           .find({ agentEmail })
//           .project({ _id: 1 })
//           .toArray();

//         if (!agentProperties.length) {
//           return res.json([]); // No properties = no offers
//         }

//         const propertyIds = agentProperties.map((p) => p._id);

//         // Find offers for those properties
//         const requestedOffers = await offersCollection
//           .aggregate([
//             { $match: { propertyId: { $in: propertyIds } } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//           ])
//           .toArray();

//         res.json(requestedOffers);
//       } catch (error) {
//         console.error("Failed to fetch requested properties:", error);
//         res.status(500).json({ error: "Failed to fetch requested properties" });
//       }
//     });

//     // ===== REVIEWS ROUTES =====
//     app.get("/reviews/user/:email", async (req, res) => {
//       const email = req.params.email;
//       try {
//         const reviews = await reviewsCollection.find({ userEmail: email }).toArray();
//         if (!reviews.length) return res.status(404).json({ message: "No reviews found for this user" });
//         res.json(reviews);
//       } catch (error) {
//         console.error("Error fetching user reviews:", error);
//         res.status(500).json({ error: "Failed to get user reviews" });
//       }
//     });

//     app.delete("/reviews/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid review ID" });

//       try {
//         const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).json({ message: "Review not found" });
//         res.json({ success: true, message: "Review deleted successfully" });
//       } catch (error) {
//         console.error("Delete review error:", error);
//         res.status(500).json({ error: "Failed to delete review" });
//       }
//     });

//     app.get("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid property ID" });

//       try {
//         // Reviews store propertyId as string
//         const reviews = await reviewsCollection.find({ propertyId }).toArray();
//         res.json(reviews);
//       } catch (error) {
//         console.error("Get reviews error:", error);
//         res.status(500).json({ error: "Failed to fetch reviews" });
//       }
//     });

//     app.post("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       const review = req.body;

//       if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid property ID" });
//       if (!review.userEmail || !review.comment) return res.status(400).json({ error: "Missing review fields" });

//       review.propertyId = propertyId; // store as string for consistency
//       review.createdAt = new Date();

//       try {
//         const result = await reviewsCollection.insertOne(review);
//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add review error:", error);
//         res.status(500).json({ error: "Failed to add review" });
//       }
//     });

//     app.get("/reviews/latest", async (req, res) => {
//       try {
//         const latestReviews = await reviewsCollection
//           .aggregate([
//             { $sort: { createdAt: -1 } },
//             { $limit: 3 },
//             {
//               $lookup: {
//                 from: "users",
//                 localField: "userEmail",
//                 foreignField: "email",
//                 as: "user",
//               },
//             },
//             { $unwind: "$user" },
//             {
//               $addFields: {
//                 propertyObjectId: { $toObjectId: "$propertyId" },
//               },
//             },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyObjectId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//             {
//               $project: {
//                 _id: 1,
//                 comment: 1,
//                 createdAt: 1,
//                 "user.name": 1,
//                 "user.photoURL": 1,
//                 "property.title": 1,
//               },
//             },
//           ])
//           .toArray();

//         res.json(latestReviews);
//       } catch (error) {
//         console.error("Failed to get latest reviews:", error);
//         res.status(500).json({ error: "Failed to get latest reviews" });
//       }
//     });

//     // ===== OFFERS ROUTES =====
//     app.post("/offers", async (req, res) => {
//       try {
//         const offer = req.body;
//         if (!offer.userEmail || !offer.propertyId || !offer.offerPrice)
//           return res.status(400).json({ success: false, error: "Missing required fields" });

//         offer.createdAt = new Date();

//         if (typeof offer.propertyId === "string" && ObjectId.isValid(offer.propertyId)) {
//           offer.propertyId = new ObjectId(offer.propertyId);
//         } else if (!(offer.propertyId instanceof ObjectId)) {
//           return res.status(400).json({ error: "Invalid propertyId format" });
//         }

//         const result = await offersCollection.insertOne(offer);
//         res.status(201).json({ success: true, insertedId: result.insertedId });
//       } catch (error) {
//         console.error("Add offer error:", error);
//         res.status(500).json({ success: false, error: "Failed to add offer" });
//       }
//     });

//     app.get("/offers", async (req, res) => {
//       const userEmail = req.query.email;
//       if (!userEmail) return res.status(400).json({ error: "Missing userEmail query param" });

//       try {
//         const offers = await offersCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//           ])
//           .toArray();

//         res.json(offers);
//       } catch (error) {
//         console.error("Get offers error:", error);
//         res.status(500).json({ error: "Failed to get offers" });
//       }
//     });

//     // Accept an offer and auto reject others for that property
//     app.patch("/offers/:id/accept", async (req, res) => {
//       const offerId = req.params.id;
//       if (!ObjectId.isValid(offerId)) return res.status(400).json({ error: "Invalid offer ID" });

//       try {
//         const offer = await offersCollection.findOne({ _id: new ObjectId(offerId) });
//         if (!offer) return res.status(404).json({ error: "Offer not found" });

//         // Update this offer to accepted
//         await offersCollection.updateOne(
//           { _id: new ObjectId(offerId) },
//           { $set: { status: "accepted" } }
//         );

//         // Reject other offers for the same property
//         await offersCollection.updateMany(
//           {
//             propertyId: offer.propertyId,
//             _id: { $ne: new ObjectId(offerId) },
//           },
//           { $set: { status: "rejected" } }
//         );

//   // ===== REQUESTED PROPERTIES (OFFERS FOR AGENT'S PROPERTIES) =====
//     app.get("/requested-properties", async (req, res) => {
//       try {
//         const agentEmail = req.query.agentEmail;
//         if (!agentEmail) {
//           return res.status(400).json({ error: "agentEmail query parameter is required" });
//         }

//         // Find properties for this agent
//         const agentProperties = await propertiesCollection
//           .find({ agentEmail })
//           .project({ _id: 1 })
//           .toArray();

//         if (!agentProperties.length) {
//           return res.json([]); // No properties = no offers
//         }

//         const propertyIds = agentProperties.map((p) => p._id);

//         // Find offers for those properties
//         const requestedOffers = await offersCollection
//           .aggregate([
//             { $match: { propertyId: { $in: propertyIds } } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//           ])
//           .toArray();

//         res.json(requestedOffers);
//       } catch (error) {
//         console.error("Failed to fetch requested properties:", error);
//         res.status(500).json({ error: "Failed to fetch requested properties" });
//       }
//     });

//     // ===== PATCH route to accept/reject offers (for requested-properties) =====
//     app.patch("/requested-properties/:offerId", async (req, res) => {
//       const { offerId } = req.params;
//       const { status, propertyId } = req.body;

//       if (!["accepted", "rejected"].includes(status)) {
//         return res.status(400).json({ success: false, message: "Invalid status value" });
//       }
//       if (!ObjectId.isValid(offerId)) {
//         return res.status(400).json({ success: false, message: "Invalid offer ID" });
//       }
//       if (!ObjectId.isValid(propertyId)) {
//         return res.status(400).json({ success: false, message: "Invalid property ID" });
//       }

//       try {
//         // Update selected offer's status
//         const updateResult = await offersCollection.updateOne(
//           { _id: new ObjectId(offerId) },
//           { $set: { status } }
//         );

//         if (updateResult.matchedCount === 0) {
//           return res.status(404).json({ success: false, message: "Offer not found" });
//         }

//         // If accepted, reject all other pending offers for the same property
//         if (status === "accepted") {
//           await offersCollection.updateMany(
//             {
//               propertyId: new ObjectId(propertyId),
//               _id: { $ne: new ObjectId(offerId) },
//               status: "pending",
//             },
//             { $set: { status: "rejected" } }
//           );
//         }

//         res.json({ success: true, message: `Offer ${status} successfully updated` });
//       } catch (error) {
//         console.error("Error updating offer status:", error);
//         res.status(500).json({ success: false, message: "Server error" });
//       }
//     });

//     // ===== OFFERS ROUTES =====
//     app.post("/offers", async (req, res) => {
//       try {
//         const offer = req.body;
//         if (!offer.userEmail || !offer.propertyId || !offer.offerPrice)
//           return res.status(400).json({ success: false, error: "Missing required fields" });

//         offer.createdAt = new Date();

//         if (typeof offer.propertyId === "string" && ObjectId.isValid(offer.propertyId)) {
//           offer.propertyId = new ObjectId(offer.propertyId);
//         } else if (!(offer.propertyId instanceof ObjectId)) {
//           return res.status(400).json({ error: "Invalid propertyId format" });
//         }

//         const result = await offersCollection.insertOne(offer);
//         res.status(201).json({ success: true, insertedId: result.insertedId });
//       } catch (error) {
//         console.error("Add offer error:", error);
//         res.status(500).json({ success: false, error: "Failed to add offer" });
//       }
//     });

//     app.get("/offers", async (req, res) => {
//       const userEmail = req.query.email;
//       if (!userEmail) return res.status(400).json({ error: "Missing userEmail query param" });

//       try {
//         const offers = await offersCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//           ])
//           .toArray();

//         res.json(offers);
//       } catch (error) {
//         console.error("Get offers error:", error);
//         res.status(500).json({ error: "Failed to get offers" });
//       }
//     });

//     // Accept an offer and auto reject others for that property (this is now optional/redundant if you use /requested-properties/:offerId patch)
//     app.patch("/offers/:id/accept", async (req, res) => {
//       const offerId = req.params.id;
//       if (!ObjectId.isValid(offerId)) return res.status(400).json({ error: "Invalid offer ID" });

//       try {
//         const offer = await offersCollection.findOne({ _id: new ObjectId(offerId) });
//         if (!offer) return res.status(404).json({ error: "Offer not found" });

//         // Update this offer to accepted
//         await offersCollection.updateOne(
//           { _id: new ObjectId(offerId) },
//           { $set: { status: "accepted" } }
//         );

//         // Reject other offers for the same property
//         await offersCollection.updateMany(
//           {
//             propertyId: offer.propertyId,
//             _id: { $ne: new ObjectId(offerId) },
//           },
//           { $set: { status: "rejected" } }
//         );

//         res.json({ message: "Offer accepted and others rejected" });
//       } catch (error) {
//         console.error("Accept offer error:", error);
//         res.status(500).json({ error: "Failed to accept offer" });
//       }
//     });

//         // //////////////////


//         app.patch("/requested-properties/:offerId", async (req, res) => {
//   const { offerId } = req.params;
//   const { status, propertyId } = req.body;

//   if (!["accepted", "rejected"].includes(status)) {
//     return res.status(400).json({ success: false, message: "Invalid status value" });
//   }
//   if (!ObjectId.isValid(offerId)) {
//     return res.status(400).json({ success: false, message: "Invalid offer ID" });
//   }
//   if (!ObjectId.isValid(propertyId)) {
//     return res.status(400).json({ success: false, message: "Invalid property ID" });
//   }

//   try {
//     // Update selected offer's status
//     const updateResult = await offersCollection.updateOne(
//       { _id: new ObjectId(offerId) },
//       { $set: { status } }
//     );

//     if (updateResult.matchedCount === 0) {
//       return res.status(404).json({ success: false, message: "Offer not found" });
//     }

//     // If accepted, reject all other pending offers for the same property
//     if (status === "accepted") {
//       await offersCollection.updateMany(
//         {
//           propertyId: new ObjectId(propertyId),
//           _id: { $ne: new ObjectId(offerId) },
//           status: "pending",
//         },
//         { $set: { status: "rejected" } }
//       );
//     }

//     res.json({ success: true, message: `Offer ${status} successfully updated` });
//   } catch (error) {
//     console.error("Error updating offer status:", error);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// });

// // //////////////////////////




// // ////////////////

//         // Example Express route
// const express = require("express");
// const router = express.Router();
// const Offer = require("../models/Offer"); // mongoose model

// // PATCH /requested-properties/:offerId
// router.patch("/:offerId", async (req, res) => {
//   const { offerId } = req.params;
//   const { status, propertyId } = req.body;

//   if (!["accepted", "rejected"].includes(status)) {
//     return res.status(400).json({ success: false, message: "Invalid status" });
//   }

//   try {
//     // Update the chosen offer status
//     await Offer.findByIdAndUpdate(offerId, { status });

//     if (status === "accepted") {
//       // Automatically reject other offers for the same property
//       await Offer.updateMany(
//         { property: propertyId, _id: { $ne: offerId }, status: "pending" },
//         { status: "rejected" }
//       );
//     }

//     res.json({ success: true, message: `Offer ${status} successfully` });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// });

// module.exports = router;






//         res.json({ message: "Offer accepted and others rejected" });
//       } catch (error) {
//         console.error("Accept offer error:", error);
//         res.status(500).json({ error: "Failed to accept offer" });
//       }
//     });

//     app.listen(port, () => {
//       console.log(`Server running on port ${port}`);
//     });
//   } catch (err) {
//     console.error(err);
//     process.exit(1);
//   }
// }
// run();




// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// dotenv.config();

// const app = express();
// const port = process.env.PORT || 5000;

// // Middleware setup
// app.use(
//   cors({
//     origin: "http://localhost:5173", // Update if deployed
//     credentials: true,
//   })
// );
// app.use(express.json());

// // Root health check route
// app.get("/", (req, res) => {
//   res.send("Real Estate API is running");
// });

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djvkmk5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// async function run() {
//   try {
//     await client.connect();
//     console.log("✅ Connected to MongoDB");

//     const db = client.db("realestate");
//     const usersCollection = db.collection("users");
//     const propertiesCollection = db.collection("properties");
//     const reviewsCollection = db.collection("reviews");
//     const wishlistCollection = db.collection("wishlists");
//     const offersCollection = db.collection("offers");

//     // ===== USER ROUTES =====
//     app.post("/users", async (req, res) => {
//       try {
//         const user = req.body;
//         if (!user.email) return res.status(400).json({ error: "Email is required" });

//         const existingUser = await usersCollection.findOne({ email: user.email });

//         const roleToSet = user.role || existingUser?.role || "user";

//         const updateData = {
//           name: user.name || existingUser?.name || "",
//           email: user.email,
//           photoURL: user.photoURL || existingUser?.photoURL || "",
//           role: roleToSet,
//         };

//         const result = await usersCollection.updateOne(
//           { email: user.email },
//           { $set: updateData },
//           { upsert: true }
//         );

//         res.json({ message: "User saved/updated", role: roleToSet, result });
//       } catch (error) {
//         console.error("Add/update user error:", error);
//         res.status(500).json({ error: "Failed to add/update user" });
//       }
//     });

//     app.get("/users/:email", async (req, res) => {
//       try {
//         const email = req.params.email;
//         if (!email) return res.status(400).json({ error: "Email is required" });

//         const user = await usersCollection.findOne({ email });
//         if (!user) return res.json({ role: "user" });

//         res.json({ role: user.role });
//       } catch (error) {
//         console.error("Get user role error:", error);
//         res.status(500).json({ error: "Failed to get user role" });
//       }
//     });

//     app.patch("/users/role/:id", async (req, res) => {
//       try {
//         const id = req.params.id;
//         const { role } = req.body;

//         if (!role) return res.status(400).json({ error: "Role is required" });
//         if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid user ID" });

//         const allowedRoles = ["user", "admin", "agent", "fraud", "verified"];
//         if (!allowedRoles.includes(role)) {
//           return res.status(400).json({ error: "Invalid role value" });
//         }

//         const result = await usersCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { role } }
//         );

//         if (result.matchedCount === 0) return res.status(404).json({ error: "User not found" });

//         res.json({ message: "User role updated", result });
//       } catch (error) {
//         console.error("Set user role error:", error);
//         res.status(500).json({ error: "Failed to update user role" });
//       }
//     });

//     app.get("/users", async (req, res) => {
//       try {
//         const users = await usersCollection.find().toArray();
//         res.json(users);
//       } catch (error) {
//         console.error("Failed to fetch users", error);
//         res.status(500).json({ error: "Failed to fetch users" });
//       }
//     });

//     app.delete("/users/:id", async (req, res) => {
//       try {
//         const userId = req.params.id;
//         if (!ObjectId.isValid(userId)) return res.status(400).json({ error: "Invalid user ID" });

//         const result = await usersCollection.deleteOne({ _id: new ObjectId(userId) });
//         if (result.deletedCount === 0) return res.status(404).json({ error: "User not found" });

//         res.json({ message: "User deleted successfully" });
//       } catch (error) {
//         console.error("Delete user error:", error);
//         res.status(500).json({ error: "Failed to delete user" });
//       }
//     });

//     // ===== PROPERTIES ROUTES =====
//     app.get("/properties", async (req, res) => {
//       try {
//         const { agentEmail } = req.query;
//         const query = agentEmail ? { agentEmail } : {};
//         const properties = await propertiesCollection.find(query).toArray();
//         res.json(properties);
//       } catch (error) {
//         console.error("Error fetching properties:", error);
//         res.status(500).json({ error: "Failed to fetch properties" });
//       }
//     });

//     app.post("/properties", async (req, res) => {
//       try {
//         const property = req.body;
//         if (!property.title || !property.location || !property.priceRange || !property.agentEmail) {
//           return res.status(400).json({ error: "Missing required fields" });
//         }
//         property.createdAt = new Date();

//         const result = await propertiesCollection.insertOne(property);
//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add property error:", error);
//         res.status(500).json({ error: "Failed to add property" });
//       }
//     });

//     app.get("/properties/:id", async (req, res) => {
//       const { id } = req.params;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid property ID format" });

//       try {
//         const property = await propertiesCollection.findOne({ _id: new ObjectId(id) });
//         if (!property) return res.status(404).json({ error: "Property not found" });
//         res.json(property);
//       } catch (error) {
//         console.error("Get property error:", error);
//         res.status(500).json({ error: "Failed to get property" });
//       }
//     });

//     app.patch("/properties/:id/status", async (req, res) => {
//       const { id } = req.params;
//       const { status } = req.body;

//       const validStatuses = ["verified", "rejected"];
//       if (!validStatuses.includes(status)) {
//         return res.status(400).json({ message: "Invalid status" });
//       }

//       if (!ObjectId.isValid(id)) {
//         return res.status(400).json({ message: "Invalid property ID" });
//       }

//       try {
//         const result = await propertiesCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { status } }
//         );

//         if (result.modifiedCount === 1) {
//           res.json({ message: "Status updated successfully" });
//         } else {
//           res.status(404).json({ message: "Property not found" });
//         }
//       } catch (error) {
//         console.error("Error updating property status:", error);
//         res.status(500).json({ message: "Internal server error" });
//       }
//     });

//     app.delete("/properties/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid property ID" });

//       try {
//         const result = await propertiesCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).json({ error: "Property not found" });
//         res.json({ message: "Property deleted successfully" });
//       } catch (error) {
//         console.error("Delete property error:", error);
//         res.status(500).json({ error: "Internal server error" });
//       }
//     });

//     // ==== DELETE ALL PROPERTIES OF AN AGENT BY EMAIL ====
//     app.delete("/properties/agent/:agentEmail", async (req, res) => {
//       const agentEmail = req.params.agentEmail;

//       if (!agentEmail) {
//         return res.status(400).json({ error: "Agent email is required" });
//       }

//       try {
//         const result = await propertiesCollection.deleteMany({ agentEmail: agentEmail });

//         if (result.deletedCount === 0) {
//           return res.status(404).json({ error: "No properties found for this agent" });
//         }

//         res.json({ message: `Deleted ${result.deletedCount} properties for agent ${agentEmail}` });
//       } catch (error) {
//         console.error("Failed to delete properties by agent:", error);
//         res.status(500).json({ error: "Failed to delete properties" });
//       }
//     });


    

//     // ===== WISHLIST ROUTES =====
//     app.post("/wishlist", async (req, res) => {
//       const { userEmail, propertyId } = req.body;
//       if (!userEmail || !propertyId) return res.status(400).json({ error: "Missing userEmail or propertyId" });

//       if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid propertyId format" });

//       try {
//         const exists = await wishlistCollection.findOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//         });

//         if (exists) return res.status(409).json({ message: "Already in wishlist" });

//         const result = await wishlistCollection.insertOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//           createdAt: new Date(),
//         });

//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add to wishlist error:", error);
//         res.status(500).json({ error: "Failed to add to wishlist" });
//       }
//     });

//     app.get("/wishlist", async (req, res) => {
//       const { userEmail } = req.query;
//       if (!userEmail) return res.status(400).json({ error: "Missing userEmail" });

//       try {
//         const items = await wishlistCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//           ])
//           .toArray();

//         res.json(items);
//       } catch (error) {
//         console.error("Get wishlist error:", error);
//         res.status(500).json({ error: "Failed to get wishlist" });
//       }
//     });

//     app.delete("/wishlist/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid wishlist item ID" });

//       try {
//         const result = await wishlistCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).json({ error: "Wishlist item not found" });
//         res.json({ message: "Removed from wishlist" });
//       } catch (error) {
//         console.error("Delete wishlist error:", error);
//         res.status(500).json({ error: "Failed to delete from wishlist" });
//       }
//     });

//     // ===== REVIEWS ROUTES =====
//     app.get("/reviews/user/:email", async (req, res) => {
//       const email = req.params.email;
//       try {
//         const reviews = await reviewsCollection.find({ userEmail: email }).toArray();
//         if (!reviews.length) return res.status(404).json({ message: "No reviews found for this user" });
//         res.json(reviews);
//       } catch (error) {
//         console.error("Error fetching user reviews:", error);
//         res.status(500).json({ error: "Failed to get user reviews" });
//       }
//     });

//     app.delete("/reviews/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid review ID" });

//       try {
//         const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).json({ message: "Review not found" });
//         res.json({ success: true, message: "Review deleted successfully" });
//       } catch (error) {
//         console.error("Delete review error:", error);
//         res.status(500).json({ error: "Failed to delete review" });
//       }
//     });

//     app.get("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid property ID" });

//       try {
//         // Reviews store propertyId as string
//         const reviews = await reviewsCollection.find({ propertyId }).toArray();
//         res.json(reviews);
//       } catch (error) {
//         console.error("Get reviews error:", error);
//         res.status(500).json({ error: "Failed to fetch reviews" });
//       }
//     });

//     app.post("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       const review = req.body;

//       if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid property ID" });
//       if (!review.userEmail || !review.comment) return res.status(400).json({ error: "Missing review fields" });

//       review.propertyId = propertyId; // store as string for consistency
//       review.createdAt = new Date();

//       try {
//         const result = await reviewsCollection.insertOne(review);
//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add review error:", error);
//         res.status(500).json({ error: "Failed to add review" });
//       }
//     });

//     app.get("/reviews/latest", async (req, res) => {
//       try {
//         const latestReviews = await reviewsCollection
//           .aggregate([
//             { $sort: { createdAt: -1 } },
//             { $limit: 3 },
//             {
//               $lookup: {
//                 from: "users",
//                 localField: "userEmail",
//                 foreignField: "email",
//                 as: "user",
//               },
//             },
//             { $unwind: "$user" },
//             {
//               $addFields: {
//                 propertyObjectId: { $toObjectId: "$propertyId" },
//               },
//             },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyObjectId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//             {
//               $project: {
//                 _id: 1,
//                 comment: 1,
//                 createdAt: 1,
//                 "user.name": 1,
//                 "user.photoURL": 1,
//                 "property.title": 1,
//               },
//             },
//           ])
//           .toArray();

//         res.json(latestReviews);
//       } catch (error) {
//         console.error("Failed to get latest reviews:", error);
//         res.status(500).json({ error: "Failed to get latest reviews" });
//       }
//     });

//     // ===== OFFERS ROUTES =====
//     app.post("/offers", async (req, res) => {
//       try {
//         const offer = req.body;
//         if (!offer.userEmail || !offer.propertyId || !offer.offerPrice)
//           return res.status(400).json({ success: false, error: "Missing required fields" });

//         offer.createdAt = new Date();

//         if (typeof offer.propertyId === "string" && ObjectId.isValid(offer.propertyId)) {
//           offer.propertyId = new ObjectId(offer.propertyId);
//         } else if (!(offer.propertyId instanceof ObjectId)) {
//           return res.status(400).json({ error: "Invalid propertyId format" });
//         }

//         const result = await offersCollection.insertOne(offer);
//         res.status(201).json({ success: true, insertedId: result.insertedId });
//       } catch (error) {
//         console.error("Add offer error:", error);
//         res.status(500).json({ success: false, error: "Failed to add offer" });
//       }
//     });


//     app.get('/reviews', async (req, res) => {
//   try {
//     const reviews = await reviewsCollection.find().toArray();
//     res.json(reviews);
//   } catch (error) {
//     res.status(500).json({ error: 'Failed to fetch reviews' });
//   }
// });



// app.delete('/reviews/:id', async (req, res) => {
//   const id = req.params.id;
//   // e.g. use MongoDB ObjectId
//   const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
//   if (result.deletedCount === 1) {
//     res.send({ deletedCount: 1 });
//   } else {
//     res.status(404).send({ deletedCount: 0, message: 'Review not found' });
//   }
// });





//     app.get("/offers", async (req, res) => {
//       const userEmail = req.query.email;
//       if (!userEmail) return res.status(400).json({ error: "Missing userEmail query param" });

//       try {
//         const offers = await offersCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             {
//               $addFields: {
//                 property: { $arrayElemAt: ["$property", 0] },
//               },
//             },
//             {
//               $project: {
//                 _id: 1,
//                 offerPrice: 1,
//                 createdAt: 1,
//                 status: 1,
//                 message: 1,
//                 property: {
//                   _id: 1,
//                   title: 1,
//                   location: 1,
//                   priceRange: 1,
//                   agentEmail: 1,
//                 },
//               },
//             },
//           ])
//           .toArray();

//         res.json(offers);
//       } catch (error) {
//         console.error("Get offers error:", error);
//         res.status(500).json({ error: "Failed to get offers" });
//       }
//     });

//     app.delete("/offers/:id", async (req, res) => {
//       const id = req.params.id;

//       if (!ObjectId.isValid(id)) {
//         return res.status(400).json({ error: "Invalid offer ID" });
//       }

//       try {
//         const result = await offersCollection.deleteOne({ _id: new ObjectId(id) });

//         if (result.deletedCount === 0) {
//           return res.status(404).json({ error: "Offer not found" });
//         }

//         res.json({ message: "Offer deleted successfully" });
//       } catch (error) {
//         console.error("Delete offer error:", error);
//         res.status(500).json({ error: "Internal server error" });
//       }
//     });

//     app.patch("/offers/:id/status", async (req, res) => {
//       const offerId = req.params.id;
//       const { status } = req.body;

//       if (!["approved", "rejected"].includes(status)) {
//         return res.status(400).json({ error: "Invalid status value" });
//       }

//       if (!ObjectId.isValid(offerId)) {
//         return res.status(400).json({ error: "Invalid offer ID" });
//       }

//       try {
//         const offer = await offersCollection.findOne({ _id: new ObjectId(offerId) });
//         if (!offer) return res.status(404).json({ error: "Offer not found" });

//         if (status === "approved") {
//           await offersCollection.updateMany(
//             {
//               propertyId: offer.propertyId,
//               _id: { $ne: offer._id },
//             },
//             { $set: { status: "rejected" } }
//           );
//         }

//         const updateResult = await offersCollection.updateOne(
//           { _id: new ObjectId(offerId) },
//           { $set: { status } }
//         );

//         res.json({ message: "Offer status updated", updateResult });
//       } catch (error) {
//         console.error("Update offer status error:", error);
//         res.status(500).json({ error: "Failed to update offer status" });
//       }
//     });



//     // Assuming offersCollection stores offers with propertyId and userEmail

// app.get("/requested-properties", async (req, res) => {
//   try {
//     // If you want, you can filter by agentEmail by querying properties collection first.

//     // 1. Get all properties where agentEmail = req.query.agentEmail
//     const agentEmail = req.query.agentEmail;
//     if (!agentEmail) {
//       return res.status(400).json({ error: "agentEmail query parameter is required" });
//     }

//     // 2. Find properties of this agent
//     const agentProperties = await propertiesCollection
//       .find({ agentEmail: agentEmail })
//       .project({ _id: 1 }) // Only need _id to match offers
//       .toArray();

//     const propertyIds = agentProperties.map((p) => p._id);

//     // 3. Find offers made for these properties
//     const requested = await offersCollection
//       .aggregate([
//         { $match: { propertyId: { $in: propertyIds } } },
//         {
//           $lookup: {
//             from: "properties",
//             localField: "propertyId",
//             foreignField: "_id",
//             as: "property",
//           },
//         },
//         { $unwind: "$property" },
//       ])
//       .toArray();

//     res.json(requested);
//   } catch (error) {
//     console.error("Failed to fetch requested properties:", error);
//     res.status(500).json({ error: "Failed to fetch requested properties" });
//   }
// });



//     // Start server
//     app.listen(port, () => {
//       console.log(`Server running on port ${port}`);
//     });
//   } catch (err) {
//     console.error("MongoDB connection error:", err);
//   }
// }

// run().catch(console.dir);






// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// dotenv.config();

// const app = express();
// const port = process.env.PORT || 5000;

// // Middleware setup
// app.use(
//   cors({
//     origin: "http://localhost:5173", // Update if deployed
//     credentials: true,
//   })
// );
// app.use(express.json());

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djvkmk5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// async function run() {
//   try {
//     await client.connect();
//     console.log("✅ Connected to MongoDB");

//     const db = client.db("realestate");
//     const usersCollection = db.collection("users");
//     const propertiesCollection = db.collection("properties");
//     const reviewsCollection = db.collection("reviews");
//     const wishlistCollection = db.collection("wishlists");
//     const offersCollection = db.collection("offers");

//     // ===== USER ROUTES =====

//     app.post("/users", async (req, res) => {
//       try {
//         const user = req.body;
//         if (!user.email) return res.status(400).json({ error: "Email is required" });

//         const existingUser = await usersCollection.findOne({ email: user.email });

//         const roleToSet = user.role || existingUser?.role || "user";

//         const updateData = {
//           name: user.name || existingUser?.name || "",
//           email: user.email,
//           photoURL: user.photoURL || existingUser?.photoURL || "",
//           role: roleToSet,
//         };

//         const result = await usersCollection.updateOne(
//           { email: user.email },
//           { $set: updateData },
//           { upsert: true }
//         );

//         res.json({ message: "User saved/updated", role: roleToSet, result });
//       } catch (error) {
//         console.error("Add/update user error:", error);
//         res.status(500).json({ error: "Failed to add/update user" });
//       }
//     });

//     app.get("/users/:email", async (req, res) => {
//       try {
//         const email = req.params.email;
//         if (!email) return res.status(400).json({ error: "Email is required" });

//         const user = await usersCollection.findOne({ email });
//         if (!user) return res.json({ role: "user" });

//         res.json({ role: user.role });
//       } catch (error) {
//         console.error("Get user role error:", error);
//         res.status(500).json({ error: "Failed to get user role" });
//       }
//     });

//     app.patch("/users/role/:id", async (req, res) => {
//       try {
//         const id = req.params.id;
//         const { role } = req.body;

//         if (!role) return res.status(400).json({ error: "Role is required" });
//         if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid user ID" });

//         const allowedRoles = ["user", "admin", "agent", "fraud", "verified"];
//         if (!allowedRoles.includes(role)) {
//           return res.status(400).json({ error: "Invalid role value" });
//         }

//         const result = await usersCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { role } }
//         );

//         if (result.matchedCount === 0) return res.status(404).json({ error: "User not found" });

//         res.json({ message: "User role updated", result });
//       } catch (error) {
//         console.error("Set user role error:", error);
//         res.status(500).json({ error: "Failed to update user role" });
//       }
//     });

//     app.get("/users", async (req, res) => {
//       try {
//         const users = await usersCollection.find().toArray();
//         res.json(users);
//       } catch (error) {
//         console.error("Failed to fetch users", error);
//         res.status(500).json({ error: "Failed to fetch users" });
//       }
//     });

//     app.delete("/users/:id", async (req, res) => {
//       try {
//         const userId = req.params.id;
//         if (!ObjectId.isValid(userId)) return res.status(400).json({ error: "Invalid user ID" });

//         const result = await usersCollection.deleteOne({ _id: new ObjectId(userId) });
//         if (result.deletedCount === 0) return res.status(404).json({ error: "User not found" });

//         res.json({ message: "User deleted successfully" });
//       } catch (error) {
//         console.error("Delete user error:", error);
//         res.status(500).json({ error: "Failed to delete user" });
//       }
//     });

//     // ===== PROPERTIES ROUTES =====

//     app.get("/properties", async (req, res) => {
//       try {
//         const { agentEmail } = req.query;
//         const query = agentEmail ? { agentEmail } : {};
//         const properties = await propertiesCollection.find(query).toArray();
//         res.json(properties);
//       } catch (error) {
//         console.error("Error fetching properties:", error);
//         res.status(500).json({ error: "Failed to fetch properties" });
//       }
//     });

//     app.post("/properties", async (req, res) => {
//       try {
//         const property = req.body;
//         if (!property.title || !property.location || !property.priceRange || !property.agentEmail) {
//           return res.status(400).json({ error: "Missing required fields" });
//         }
//         property.createdAt = new Date();

//         const result = await propertiesCollection.insertOne(property);
//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add property error:", error);
//         res.status(500).json({ error: "Failed to add property" });
//       }
//     });

//     app.get("/properties/:id", async (req, res) => {
//       const { id } = req.params;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid property ID format" });

//       try {
//         const property = await propertiesCollection.findOne({ _id: new ObjectId(id) });
//         if (!property) return res.status(404).json({ error: "Property not found" });
//         res.json(property);
//       } catch (error) {
//         console.error("Get property error:", error);
//         res.status(500).json({ error: "Failed to get property" });
//       }
//     });

//     app.patch("/properties/:id/status", async (req, res) => {
//       const { id } = req.params;
//       const { status } = req.body;

//       const validStatuses = ["verified", "rejected"];
//       if (!validStatuses.includes(status)) {
//         return res.status(400).json({ message: "Invalid status" });
//       }

//       if (!ObjectId.isValid(id)) {
//         return res.status(400).json({ message: "Invalid property ID" });
//       }

//       try {
//         const result = await propertiesCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { status } }
//         );

//         if (result.modifiedCount === 1) {
//           res.json({ message: "Status updated successfully" });
//         } else {
//           res.status(404).json({ message: "Property not found" });
//         }
//       } catch (error) {
//         console.error("Error updating property status:", error);
//         res.status(500).json({ message: "Internal server error" });
//       }
//     });

//     app.delete("/properties/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid property ID" });

//       try {
//         const result = await propertiesCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).json({ error: "Property not found" });
//         res.json({ message: "Property deleted successfully" });
//       } catch (error) {
//         console.error("Delete property error:", error);
//         res.status(500).json({ error: "Internal server error" });
//       }
//     });

//     // ==== DELETE ALL PROPERTIES OF AN AGENT BY EMAIL ====

//     app.delete("/properties/agent/:agentEmail", async (req, res) => {
//       const agentEmail = req.params.agentEmail;

//       if (!agentEmail) {
//         return res.status(400).json({ error: "Agent email is required" });
//       }

//       try {
//         const result = await propertiesCollection.deleteMany({ agentEmail: agentEmail });

//         if (result.deletedCount === 0) {
//           return res.status(404).json({ error: "No properties found for this agent" });
//         }

//         res.json({ message: `Deleted ${result.deletedCount} properties for agent ${agentEmail}` });
//       } catch (error) {
//         console.error("Failed to delete properties by agent:", error);
//         res.status(500).json({ error: "Failed to delete properties" });
//       }
//     });

//     // ===== WISHLIST ROUTES =====

//     app.post("/wishlist", async (req, res) => {
//       const { userEmail, propertyId } = req.body;
//       if (!userEmail || !propertyId) return res.status(400).json({ error: "Missing userEmail or propertyId" });

//       if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid propertyId format" });

//       try {
//         const exists = await wishlistCollection.findOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//         });

//         if (exists) return res.status(409).json({ message: "Already in wishlist" });

//         const result = await wishlistCollection.insertOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//           createdAt: new Date(),
//         });

//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add to wishlist error:", error);
//         res.status(500).json({ error: "Failed to add to wishlist" });
//       }
//     });

//     app.get("/wishlist", async (req, res) => {
//       const { userEmail } = req.query;
//       if (!userEmail) return res.status(400).json({ error: "Missing userEmail" });

//       try {
//         const items = await wishlistCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//           ])
//           .toArray();

//         res.json(items);
//       } catch (error) {
//         console.error("Get wishlist error:", error);
//         res.status(500).json({ error: "Failed to get wishlist" });
//       }
//     });

//     app.delete("/wishlist/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid wishlist item ID" });

//       try {
//         const result = await wishlistCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).json({ error: "Wishlist item not found" });
//         res.json({ message: "Removed from wishlist" });
//       } catch (error) {
//         console.error("Delete wishlist error:", error);
//         res.status(500).json({ error: "Failed to delete from wishlist" });
//       }
//     });

//     // ===== REVIEWS ROUTES =====

//     app.get("/reviews/user/:email", async (req, res) => {
//       const email = req.params.email;
//       try {
//         const reviews = await reviewsCollection.find({ userEmail: email }).toArray();
//         if (!reviews.length) return res.status(404).json({ message: "No reviews found for this user" });
//         res.json(reviews);
//       } catch (error) {
//         console.error("Error fetching user reviews:", error);
//         res.status(500).json({ error: "Failed to get user reviews" });
//       }
//     });

//     app.delete("/reviews/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid review ID" });

//       try {
//         const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).json({ message: "Review not found" });
//         res.json({ success: true, message: "Review deleted successfully" });
//       } catch (error) {
//         console.error("Delete review error:", error);
//         res.status(500).json({ error: "Failed to delete review" });
//       }
//     });

//     app.get("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid property ID" });

//       try {
//         // Reviews store propertyId as string
//         const reviews = await reviewsCollection.find({ propertyId }).toArray();
//         res.json(reviews);
//       } catch (error) {
//         console.error("Get reviews error:", error);
//         res.status(500).json({ error: "Failed to fetch reviews" });
//       }
//     });

//     app.post("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       const review = req.body;

//       if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid property ID" });
//       if (!review.userEmail || !review.comment) return res.status(400).json({ error: "Missing review fields" });

//       review.propertyId = propertyId; // store as string for consistency
//       review.createdAt = new Date();

//       try {
//         const result = await reviewsCollection.insertOne(review);
//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add review error:", error);
//         res.status(500).json({ error: "Failed to add review" });
//       }
//     });

//     app.get("/reviews/latest", async (req, res) => {
//       try {
//         const latestReviews = await reviewsCollection
//           .aggregate([
//             { $sort: { createdAt: -1 } },
//             { $limit: 3 },
//             {
//               $lookup: {
//                 from: "users",
//                 localField: "userEmail",
//                 foreignField: "email",
//                 as: "user",
//               },
//             },
//             { $unwind: "$user" },
//             {
//               $addFields: {
//                 propertyObjectId: { $toObjectId: "$propertyId" },
//               },
//             },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyObjectId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//             {
//               $project: {
//                 _id: 1,
//                 comment: 1,
//                 createdAt: 1,
//                 "user.name": 1,
//                 "user.photoURL": 1,
//                 "property.title": 1,
//               },
//             },
//           ])
//           .toArray();

//         res.json(latestReviews);
//       } catch (error) {
//         console.error("Failed to get latest reviews:", error);
//         res.status(500).json({ error: "Failed to get latest reviews" });
//       }
//     });

//     // ===== OFFERS ROUTES =====

//     app.post("/offers", async (req, res) => {
//       try {
//         const offer = req.body;
//         if (!offer.userEmail || !offer.propertyId || !offer.offerPrice)
//           return res.status(400).json({ success: false, error: "Missing required fields" });

//         offer.createdAt = new Date();

//         if (typeof offer.propertyId === "string" && ObjectId.isValid(offer.propertyId)) {
//           offer.propertyId = new ObjectId(offer.propertyId);
//         } else if (!(offer.propertyId instanceof ObjectId)) {
//           return res.status(400).json({ error: "Invalid propertyId format" });
//         }

//         const result = await offersCollection.insertOne(offer);
//         res.status(201).json({ success: true, insertedId: result.insertedId });
//       } catch (error) {
//         console.error("Add offer error:", error);
//         res.status(500).json({ success: false, error: "Failed to add offer" });
//       }
//     });

//     app.get("/offers", async (req, res) => {
//       const userEmail = req.query.email;
//       if (!userEmail) return res.status(400).json({ error: "Missing userEmail query param" });

//       try {
//         const offers = await offersCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             {
//               $addFields: {
//                 property: { $arrayElemAt: ["$property", 0] },
//               },
//             },
//             {
//               $project: {
//                 _id: 1,
//                 offerPrice: 1,
//                 createdAt: 1,
//                 status: 1,
//                 message: 1,
//                 property: {
//                   _id: 1,
//                   title: 1,
//                   location: 1,
//                   priceRange: 1,
//                   agentEmail: 1,
//                 },
//               },
//             },
//           ])
//           .toArray();

//         res.json(offers);
//       } catch (error) {
//         console.error("Get offers error:", error);
//         res.status(500).json({ error: "Failed to get offers" });
//       }
//     });

//     app.delete("/offers/:id", async (req, res) => {
//       const id = req.params.id;

//       if (!ObjectId.isValid(id)) {
//         return res.status(400).json({ error: "Invalid offer ID" });
//       }

//       try {
//         const result = await offersCollection.deleteOne({ _id: new ObjectId(id) });

//         if (result.deletedCount === 0) {
//           return res.status(404).json({ error: "Offer not found" });
//         }

//         res.json({ message: "Offer deleted successfully" });
//       } catch (error) {
//         console.error("Delete offer error:", error);
//         res.status(500).json({ error: "Internal server error" });
//       }
//     });

//     app.patch("/offers/:id/status", async (req, res) => {
//       const offerId = req.params.id;
//       const { status } = req.body;

//       if (!["approved", "rejected"].includes(status)) {
//         return res.status(400).json({ error: "Invalid status value" });
//       }

//       if (!ObjectId.isValid(offerId)) {
//         return res.status(400).json({ error: "Invalid offer ID" });
//       }

//       try {
//         const offer = await offersCollection.findOne({ _id: new ObjectId(offerId) });
//         if (!offer) return res.status(404).json({ error: "Offer not found" });

//         if (status === "approved") {
//           await offersCollection.updateMany(
//             {
//               propertyId: offer.propertyId,
//               _id: { $ne: offer._id },
//             },
//             { $set: { status: "rejected" } }
//           );
//         }

//         const updateResult = await offersCollection.updateOne(
//           { _id: new ObjectId(offerId) },
//           { $set: { status } }
//         );

//         res.json({ message: "Offer status updated", updateResult });
//       } catch (error) {
//         console.error("Update offer status error:", error);
//         res.status(500).json({ error: "Failed to update offer status" });
//       }
//     });

//     // Start server
//     app.listen(port, () => {
//       console.log(`Server running on port ${port}`);
//     });
//   } catch (err) {
//     console.error("MongoDB connection error:", err);
//   }
// }

// run().catch(console.dir);








// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// dotenv.config();

// const app = express();
// const port = process.env.PORT || 5000;

// // Middleware setup
// app.use(
//   cors({
//     origin: "http://localhost:5173", // Update to your frontend URL if deployed
//     credentials: true,
//   })
// );
// app.use(express.json());

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djvkmk5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// async function run() {
//   try {
//     await client.connect();
//     console.log("✅ Connected to MongoDB");

//     const db = client.db("realestate");
//     const usersCollection = db.collection("users");
//     const propertiesCollection = db.collection("properties");
//     const reviewsCollection = db.collection("reviews");
//     const wishlistCollection = db.collection("wishlists");
//     const offersCollection = db.collection("offers");

//     // ===== USER ROUTES =====

//     app.post("/users", async (req, res) => {
//       try {
//         const user = req.body;
//         if (!user.email) return res.status(400).json({ error: "Email is required" });

//         const existingUser = await usersCollection.findOne({ email: user.email });

//         const roleToSet = user.role || existingUser?.role || "user";

//         const updateData = {
//           name: user.name || existingUser?.name || "",
//           email: user.email,
//           photoURL: user.photoURL || existingUser?.photoURL || "",
//           role: roleToSet,
//         };

//         const result = await usersCollection.updateOne(
//           { email: user.email },
//           { $set: updateData },
//           { upsert: true }
//         );

//         res.json({ message: "User saved/updated", role: roleToSet, result });
//       } catch (error) {
//         console.error("Add/update user error:", error);
//         res.status(500).json({ error: "Failed to add/update user" });
//       }
//     });

//     app.get("/users/:email", async (req, res) => {
//       try {
//         const email = req.params.email;
//         if (!email) return res.status(400).json({ error: "Email is required" });

//         const user = await usersCollection.findOne({ email });
//         if (!user) return res.json({ role: "user" });

//         res.json({ role: user.role });
//       } catch (error) {
//         console.error("Get user role error:", error);
//         res.status(500).json({ error: "Failed to get user role" });
//       }
//     });

//     app.patch("/users/role/:id", async (req, res) => {
//       try {
//         const id = req.params.id;
//         const { role } = req.body;

//         if (!role) return res.status(400).json({ error: "Role is required" });
//         if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid user ID" });

//         const allowedRoles = ["user", "admin", "agent", "fraud", "verified"];
//         if (!allowedRoles.includes(role)) {
//           return res.status(400).json({ error: "Invalid role value" });
//         }

//         const result = await usersCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { role } }
//         );

//         if (result.matchedCount === 0) return res.status(404).json({ error: "User not found" });

//         res.json({ message: "User role updated", result });
//       } catch (error) {
//         console.error("Set user role error:", error);
//         res.status(500).json({ error: "Failed to update user role" });
//       }
//     });

//     app.get("/users", async (req, res) => {
//       try {
//         const users = await usersCollection.find().toArray();
//         res.json(users);
//       } catch (error) {
//         console.error("Failed to fetch users", error);
//         res.status(500).json({ error: "Failed to fetch users" });
//       }
//     });

//     app.delete("/users/:id", async (req, res) => {
//       try {
//         const userId = req.params.id;
//         if (!ObjectId.isValid(userId)) return res.status(400).json({ error: "Invalid user ID" });

//         const result = await usersCollection.deleteOne({ _id: new ObjectId(userId) });
//         if (result.deletedCount === 0) return res.status(404).json({ error: "User not found" });

//         res.json({ message: "User deleted successfully" });
//       } catch (error) {
//         console.error("Delete user error:", error);
//         res.status(500).json({ error: "Failed to delete user" });
//       }
//     });

//     // ===== PROPERTIES ROUTES =====

//     app.get("/properties", async (req, res) => {
//       try {
//         const { agentEmail } = req.query;
//         const query = agentEmail ? { agentEmail } : {};
//         const properties = await propertiesCollection.find(query).toArray();
//         res.json(properties);
//       } catch (error) {
//         console.error("Error fetching properties:", error);
//         res.status(500).json({ error: "Failed to fetch properties" });
//       }
//     });

//     app.post("/properties", async (req, res) => {
//       try {
//         const property = req.body;
//         if (!property.title || !property.location || !property.priceRange || !property.agentEmail) {
//           return res.status(400).json({ error: "Missing required fields" });
//         }
//         property.createdAt = new Date();

//         const result = await propertiesCollection.insertOne(property);
//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add property error:", error);
//         res.status(500).json({ error: "Failed to add property" });
//       }
//     });

//     app.get("/properties/:id", async (req, res) => {
//       const { id } = req.params;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid property ID format" });

//       try {
//         const property = await propertiesCollection.findOne({ _id: new ObjectId(id) });
//         if (!property) return res.status(404).json({ error: "Property not found" });
//         res.json(property);
//       } catch (error) {
//         console.error("Get property error:", error);
//         res.status(500).json({ error: "Failed to get property" });
//       }
//     });

//     app.patch("/properties/:id/status", async (req, res) => {
//       const { id } = req.params;
//       const { status } = req.body;

//       const validStatuses = ["verified", "rejected"];
//       if (!validStatuses.includes(status)) {
//         return res.status(400).json({ message: "Invalid status" });
//       }

//       if (!ObjectId.isValid(id)) {
//         return res.status(400).json({ message: "Invalid property ID" });
//       }

//       try {
//         const result = await propertiesCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { status } }
//         );

//         if (result.modifiedCount === 1) {
//           res.json({ message: "Status updated successfully" });
//         } else {
//           res.status(404).json({ message: "Property not found" });
//         }
//       } catch (error) {
//         console.error("Error updating property status:", error);
//         res.status(500).json({ message: "Internal server error" });
//       }
//     });

//     app.delete("/properties/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid property ID" });

//       try {
//         const result = await propertiesCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).json({ error: "Property not found" });
//         res.json({ message: "Property deleted successfully" });
//       } catch (error) {
//         console.error("Delete property error:", error);
//         res.status(500).json({ error: "Internal server error" });
//       }
//     });

//     // ==== ADD THIS ROUTE: DELETE ALL PROPERTIES OF AN AGENT BY EMAIL ====

//     app.delete("/properties/agent/:agentEmail", async (req, res) => {
//       const agentEmail = req.params.agentEmail;

//       if (!agentEmail) {
//         return res.status(400).json({ error: "Agent email is required" });
//       }

//       try {
//         const result = await propertiesCollection.deleteMany({ agentEmail: agentEmail });

//         if (result.deletedCount === 0) {
//           return res.status(404).json({ error: "No properties found for this agent" });
//         }

//         res.json({ message: `Deleted ${result.deletedCount} properties for agent ${agentEmail}` });
//       } catch (error) {
//         console.error("Failed to delete properties by agent:", error);
//         res.status(500).json({ error: "Failed to delete properties" });
//       }
//     });

//     // ===== WISHLIST ROUTES =====

//     app.post("/wishlist", async (req, res) => {
//       const { userEmail, propertyId } = req.body;
//       if (!userEmail || !propertyId) return res.status(400).json({ error: "Missing userEmail or propertyId" });

//       if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid propertyId format" });

//       try {
//         const exists = await wishlistCollection.findOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//         });

//         if (exists) return res.status(409).json({ message: "Already in wishlist" });

//         const result = await wishlistCollection.insertOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//           createdAt: new Date(),
//         });

//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add to wishlist error:", error);
//         res.status(500).json({ error: "Failed to add to wishlist" });
//       }
//     });

//     app.get("/wishlist", async (req, res) => {
//       const { userEmail } = req.query;
//       if (!userEmail) return res.status(400).json({ error: "Missing userEmail" });

//       try {
//         const items = await wishlistCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//           ])
//           .toArray();

//         res.json(items);
//       } catch (error) {
//         console.error("Get wishlist error:", error);
//         res.status(500).json({ error: "Failed to get wishlist" });
//       }
//     });

//     app.delete("/wishlist/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid wishlist item ID" });

//       try {
//         const result = await wishlistCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).json({ error: "Wishlist item not found" });
//         res.json({ message: "Removed from wishlist" });
//       } catch (error) {
//         console.error("Delete wishlist error:", error);
//         res.status(500).json({ error: "Failed to delete from wishlist" });
//       }
//     });

//     // ===== REVIEWS ROUTES =====

//     app.get("/reviews/user/:email", async (req, res) => {
//       const email = req.params.email;
//       try {
//         const reviews = await reviewsCollection.find({ userEmail: email }).toArray();
//         if (!reviews.length) return res.status(404).json({ message: "No reviews found for this user" });
//         res.json(reviews);
//       } catch (error) {
//         console.error("Error fetching user reviews:", error);
//         res.status(500).json({ error: "Failed to get user reviews" });
//       }
//     });

//     app.delete("/reviews/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid review ID" });

//       try {
//         const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).json({ message: "Review not found" });
//         res.json({ success: true, message: "Review deleted successfully" });
//       } catch (error) {
//         console.error("Delete review error:", error);
//         res.status(500).json({ error: "Failed to delete review" });
//       }
//     });

//     app.get("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid property ID" });

//       try {
//         // Reviews store propertyId as string
//         const reviews = await reviewsCollection.find({ propertyId }).toArray();
//         res.json(reviews);
//       } catch (error) {
//         console.error("Get reviews error:", error);
//         res.status(500).json({ error: "Failed to fetch reviews" });
//       }
//     });

//     app.post("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       const review = req.body;

//       if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid property ID" });
//       if (!review.userEmail || !review.comment) return res.status(400).json({ error: "Missing review fields" });

//       review.propertyId = propertyId; // store as string for consistency
//       review.createdAt = new Date();

//       try {
//         const result = await reviewsCollection.insertOne(review);
//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add review error:", error);
//         res.status(500).json({ error: "Failed to add review" });
//       }
//     });

//     app.get("/reviews/latest", async (req, res) => {
//       try {
//         const latestReviews = await reviewsCollection
//           .aggregate([
//             { $sort: { createdAt: -1 } },
//             { $limit: 3 },
//             {
//               $lookup: {
//                 from: "users",
//                 localField: "userEmail",
//                 foreignField: "email",
//                 as: "user",
//               },
//             },
//             { $unwind: "$user" },
//             {
//               $addFields: {
//                 propertyObjectId: { $toObjectId: "$propertyId" },
//               },
//             },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyObjectId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//             {
//               $project: {
//                 _id: 1,
//                 comment: 1,
//                 createdAt: 1,
//                 "user.name": 1,
//                 "user.photoURL": 1,
//                 "property.title": 1,
//               },
//             },
//           ])
//           .toArray();

//         res.json(latestReviews);
//       } catch (error) {
//         console.error("Failed to get latest reviews:", error);
//         res.status(500).json({ error: "Failed to get latest reviews" });
//       }
//     });

//     // ===== OFFERS ROUTES =====

//     app.post("/offers", async (req, res) => {
//       try {
//         const offer = req.body;
//         if (!offer.userEmail || !offer.propertyId || !offer.offerPrice)
//           return res.status(400).json({ success: false, error: "Missing required fields" });

//         offer.createdAt = new Date();

//         if (typeof offer.propertyId === "string" && ObjectId.isValid(offer.propertyId)) {
//           offer.propertyId = new ObjectId(offer.propertyId);
//         } else if (!(offer.propertyId instanceof ObjectId)) {
//           return res.status(400).json({ error: "Invalid propertyId format" });
//         }

//         const result = await offersCollection.insertOne(offer);
//         res.status(201).json({ success: true, insertedId: result.insertedId });
//       } catch (error) {
//         console.error("Add offer error:", error);
//         res.status(500).json({ success: false, error: "Failed to add offer" });
//       }
//     });

//     app.get("/offers", async (req, res) => {
//       const userEmail = req.query.email;
//       if (!userEmail) return res.status(400).json({ error: "Missing userEmail query param" });

//       try {
//         const offers = await offersCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             {
//               $addFields: {
//                 property: { $arrayElemAt: ["$property", 0] },
//               },
//             },
//             {
//               $project: {
//                 _id: 1,
//                 offerPrice: 1,
//                 createdAt: 1,
//                 status: 1,
//                 message: 1,
//                 property: {
//                   _id: 1,
//                   title: 1,
//                   location: 1,
//                   priceRange: 1,
//                   agentEmail: 1,
//                 },
//               },
//             },
//           ])
//           .toArray();

//         res.json(offers);
//       } catch (error) {
//         console.error("Get offers error:", error);
//         res.status(500).json({ error: "Failed to get offers" });
//       }
//     });

//     app.delete("/offers/:id", async (req, res) => {
//       const id = req.params.id;

//       if (!ObjectId.isValid(id)) {
//         return res.status(400).json({ error: "Invalid offer ID" });
//       }

//       try {
//         const result = await offersCollection.deleteOne({ _id: new ObjectId(id) });

//         if (result.deletedCount === 0) {
//           return res.status(404).json({ error: "Offer not found" });
//         }

//         res.json({ message: "Offer deleted successfully" });
//       } catch (error) {
//         console.error("Delete offer error:", error);
//         res.status(500).json({ error: "Internal server error" });
//       }
//     });

//     app.patch("/offers/:id/status", async (req, res) => {
//       const offerId = req.params.id;
//       const { status } = req.body;

//       if (!["approved", "rejected"].includes(status)) {
//         return res.status(400).json({ error: "Invalid status value" });
//       }

//       if (!ObjectId.isValid(offerId)) {
//         return res.status(400).json({ error: "Invalid offer ID" });
//       }

//       try {
//         const offer = await offersCollection.findOne({ _id: new ObjectId(offerId) });
//         if (!offer) return res.status(404).json({ error: "Offer not found" });

//         if (status === "approved") {
//           await offersCollection.updateMany(
//             {
//               propertyId: offer.propertyId,
//               _id: { $ne: offer._id },
//             },
//             { $set: { status: "rejected" } }
//           );
//         }

//         const updateResult = await offersCollection.updateOne(
//           { _id: new ObjectId(offerId) },
//           { $set: { status } }
//         );

//         res.json({ message: "Offer status updated", updateResult });
//       } catch (error) {
//         console.error("Update offer status error:", error);
//         res.status(500).json({ error: "Failed to update offer status" });
//       }
//     });

//     // Start server
//     app.listen(port, () => {
//       console.log(`Server running on port ${port}`);
//     });
//   } catch (err) {
//     console.error("MongoDB connection error:", err);
//   }
// }
// run().catch(console.dir);



// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// dotenv.config();

// const app = express();
// const port = process.env.PORT || 5000;

// // Middleware setup
// app.use(
//   cors({
//     origin: "http://localhost:5173", // Frontend URL, change if deployed
//     credentials: true,
//   })
// );
// app.use(express.json());

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djvkmk5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// async function run() {
//   try {
//     await client.connect();
//     console.log("✅ Connected to MongoDB");

//     const db = client.db("realestate");
//     const usersCollection = db.collection("users");
//     const propertiesCollection = db.collection("properties");
//     const reviewsCollection = db.collection("reviews");
//     const wishlistCollection = db.collection("wishlists");
//     const offersCollection = db.collection("offers");

//     // ===== USER ROUTES =====

//     // Add or update user
//     app.post("/users", async (req, res) => {
//       try {
//         const user = req.body;
//         if (!user.email) return res.status(400).json({ error: "Email is required" });

//         const existingUser = await usersCollection.findOne({ email: user.email });

//         // Role priority: request role > existing role > default "user"
//         const roleToSet = user.role || existingUser?.role || "user";

//         const updateData = {
//           name: user.name || existingUser?.name || "",
//           email: user.email,
//           photoURL: user.photoURL || existingUser?.photoURL || "",
//           role: roleToSet,
//         };

//         const result = await usersCollection.updateOne(
//           { email: user.email },
//           { $set: updateData },
//           { upsert: true }
//         );

//         res.json({ message: "User saved/updated", role: roleToSet, result });
//       } catch (error) {
//         console.error("Add/update user error:", error);
//         res.status(500).json({ error: "Failed to add/update user" });
//       }
//     });

//     // Get user role by email
//     app.get("/users/:email", async (req, res) => {
//       try {
//         const email = req.params.email;
//         if (!email) return res.status(400).json({ error: "Email is required" });

//         const user = await usersCollection.findOne({ email });
//         if (!user) return res.json({ role: "user" });

//         res.json({ role: user.role });
//       } catch (error) {
//         console.error("Get user role error:", error);
//         res.status(500).json({ error: "Failed to get user role" });
//       }
//     });

//     // Update user role
//     app.patch("/users/role/:id", async (req, res) => {
//       try {
//         const id = req.params.id;
//         const { role } = req.body;

//         if (!role) return res.status(400).json({ error: "Role is required" });
//         if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid user ID" });

//         const allowedRoles = ["user", "admin", "agent", "fraud"];
//         if (!allowedRoles.includes(role)) {
//           return res.status(400).json({ error: "Invalid role value" });
//         }

//         const result = await usersCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { role } }
//         );

//         if (result.matchedCount === 0) return res.status(404).json({ error: "User not found" });

//         res.json({ message: "User role updated", result });
//       } catch (error) {
//         console.error("Set user role error:", error);
//         res.status(500).json({ error: "Failed to update user role" });
//       }
//     });

//     // Get all users
//     app.get("/users", async (req, res) => {
//       try {
//         const users = await usersCollection.find().toArray();
//         res.json(users);
//       } catch (error) {
//         console.error("Failed to fetch users", error);
//         res.status(500).json({ error: "Failed to fetch users" });
//       }
//     });

//     // Delete user
//     app.delete("/users/:id", async (req, res) => {
//       try {
//         const userId = req.params.id;
//         if (!ObjectId.isValid(userId)) return res.status(400).json({ error: "Invalid user ID" });

//         const result = await usersCollection.deleteOne({ _id: new ObjectId(userId) });
//         if (result.deletedCount === 0) return res.status(404).json({ error: "User not found" });

//         res.json({ message: "User deleted successfully" });
//       } catch (error) {
//         console.error("Delete user error:", error);
//         res.status(500).json({ error: "Failed to delete user" });
//       }
//     });

//     // ===== PROPERTIES ROUTES =====

//     app.get("/properties", async (req, res) => {
//       try {
//         const { agentEmail } = req.query;
//         const query = agentEmail ? { agentEmail } : {};
//         const properties = await propertiesCollection.find(query).toArray();
//         res.json(properties);
//       } catch (error) {
//         console.error("Error fetching properties:", error);
//         res.status(500).json({ error: "Failed to fetch properties" });
//       }
//     });

//     app.post("/properties", async (req, res) => {
//       try {
//         const property = req.body;
//         if (!property.title || !property.location || !property.priceRange || !property.agentEmail) {
//           return res.status(400).json({ error: "Missing required fields" });
//         }
//         property.createdAt = new Date();

//         const result = await propertiesCollection.insertOne(property);
//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add property error:", error);
//         res.status(500).json({ error: "Failed to add property" });
//       }
//     });

//     app.get("/properties/:id", async (req, res) => {
//       const { id } = req.params;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid property ID format" });

//       try {
//         const property = await propertiesCollection.findOne({ _id: new ObjectId(id) });
//         if (!property) return res.status(404).json({ error: "Property not found" });
//         res.json(property);
//       } catch (error) {
//         console.error("Get property error:", error);
//         res.status(500).json({ error: "Failed to get property" });
//       }
//     });

//     app.patch("/properties/:id/status", async (req, res) => {
//       const { id } = req.params;
//       const { status } = req.body;

//       const validStatuses = ["verified", "rejected"];
//       if (!validStatuses.includes(status)) {
//         return res.status(400).json({ message: "Invalid status" });
//       }

//       if (!ObjectId.isValid(id)) {
//         return res.status(400).json({ message: "Invalid property ID" });
//       }

//       try {
//         const result = await propertiesCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { status } }
//         );

//         if (result.modifiedCount === 1) {
//           res.json({ message: "Status updated successfully" });
//         } else {
//           res.status(404).json({ message: "Property not found" });
//         }
//       } catch (error) {
//         console.error("Error updating property status:", error);
//         res.status(500).json({ message: "Internal server error" });
//       }
//     });

//     app.delete("/properties/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid property ID" });

//       try {
//         const result = await propertiesCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).json({ error: "Property not found" });
//         res.json({ message: "Property deleted successfully" });
//       } catch (error) {
//         console.error("Delete property error:", error);
//         res.status(500).json({ error: "Internal server error" });
//       }
//     });

//     // ===== WISHLIST ROUTES =====

//     app.post("/wishlist", async (req, res) => {
//       const { userEmail, propertyId } = req.body;
//       if (!userEmail || !propertyId) return res.status(400).json({ error: "Missing userEmail or propertyId" });

//       if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid propertyId format" });

//       try {
//         const exists = await wishlistCollection.findOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//         });

//         if (exists) return res.status(409).json({ message: "Already in wishlist" });

//         const result = await wishlistCollection.insertOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//           createdAt: new Date(),
//         });

//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add to wishlist error:", error);
//         res.status(500).json({ error: "Failed to add to wishlist" });
//       }
//     });

//     app.get("/wishlist", async (req, res) => {
//       const { userEmail } = req.query;
//       if (!userEmail) return res.status(400).json({ error: "Missing userEmail" });

//       try {
//         const items = await wishlistCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//           ])
//           .toArray();

//         res.json(items);
//       } catch (error) {
//         console.error("Get wishlist error:", error);
//         res.status(500).json({ error: "Failed to get wishlist" });
//       }
//     });

//     app.delete("/wishlist/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid wishlist item ID" });

//       try {
//         const result = await wishlistCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).json({ error: "Wishlist item not found" });
//         res.json({ message: "Removed from wishlist" });
//       } catch (error) {
//         console.error("Delete wishlist error:", error);
//         res.status(500).json({ error: "Failed to delete from wishlist" });
//       }
//     });

//     // ===== REVIEWS ROUTES =====

//     app.get("/reviews/user/:email", async (req, res) => {
//       const email = req.params.email;
//       try {
//         const reviews = await reviewsCollection.find({ userEmail: email }).toArray();
//         if (!reviews.length) return res.status(404).json({ message: "No reviews found for this user" });
//         res.json(reviews);
//       } catch (error) {
//         console.error("Error fetching user reviews:", error);
//         res.status(500).json({ error: "Failed to get user reviews" });
//       }
//     });

//     app.delete("/reviews/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid review ID" });

//       try {
//         const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).json({ message: "Review not found" });
//         res.json({ success: true, message: "Review deleted successfully" });
//       } catch (error) {
//         console.error("Delete review error:", error);
//         res.status(500).json({ error: "Failed to delete review" });
//       }
//     });

//     app.get("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid property ID" });

//       try {
//         // Reviews store propertyId as string
//         const reviews = await reviewsCollection.find({ propertyId }).toArray();
//         res.json(reviews);
//       } catch (error) {
//         console.error("Get reviews error:", error);
//         res.status(500).json({ error: "Failed to fetch reviews" });
//       }
//     });

//     app.post("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       const review = req.body;

//       if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid property ID" });
//       if (!review.userEmail || !review.comment) return res.status(400).json({ error: "Missing review fields" });

//       review.propertyId = propertyId; // store as string for consistency
//       review.createdAt = new Date();

//       try {
//         const result = await reviewsCollection.insertOne(review);
//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add review error:", error);
//         res.status(500).json({ error: "Failed to add review" });
//       }
//     });

//     app.get("/reviews/latest", async (req, res) => {
//       try {
//         const latestReviews = await reviewsCollection
//           .aggregate([
//             { $sort: { createdAt: -1 } },
//             { $limit: 3 },
//             {
//               $lookup: {
//                 from: "users",
//                 localField: "userEmail",
//                 foreignField: "email",
//                 as: "user",
//               },
//             },
//             { $unwind: "$user" },
//             {
//               $addFields: {
//                 propertyObjectId: { $toObjectId: "$propertyId" },
//               },
//             },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyObjectId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//             {
//               $project: {
//                 _id: 1,
//                 comment: 1,
//                 createdAt: 1,
//                 "user.name": 1,
//                 "user.photoURL": 1,
//                 "property.title": 1,
//               },
//             },
//           ])
//           .toArray();

//         res.json(latestReviews);
//       } catch (error) {
//         console.error("Failed to get latest reviews:", error);
//         res.status(500).json({ error: "Failed to get latest reviews" });
//       }
//     });










    
//     // ===== OFFERS ROUTES =====

//     app.post("/offers", async (req, res) => {
//       try {
//         const offer = req.body;
//         if (!offer.userEmail || !offer.propertyId || !offer.offerPrice)
//           return res.status(400).json({ success: false, error: "Missing required fields" });

//         offer.createdAt = new Date();

//         if (typeof offer.propertyId === "string" && ObjectId.isValid(offer.propertyId)) {
//           offer.propertyId = new ObjectId(offer.propertyId);
//         } else if (!(offer.propertyId instanceof ObjectId)) {
//           return res.status(400).json({ error: "Invalid propertyId format" });
//         }

//         const result = await offersCollection.insertOne(offer);
//         res.status(201).json({ success: true, insertedId: result.insertedId });
//       } catch (error) {
//         console.error("Add offer error:", error);
//         res.status(500).json({ success: false, error: "Failed to add offer" });
//       }
//     });

//     app.get("/offers", async (req, res) => {
//       const userEmail = req.query.email;
//       if (!userEmail) return res.status(400).json({ error: "Missing userEmail query param" });

//       try {
//         const offers = await offersCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             {
//               $addFields: {
//                 property: { $arrayElemAt: ["$property", 0] },
//               },
//             },
//             {
//               $project: {
//                 _id: 1,
//                 offerPrice: 1,
//                 createdAt: 1,
//                 status: 1,
//                 message: 1,
//                 property: {
//                   _id: 1,
//                   title: 1,
//                   location: 1,
//                   priceRange: 1,
//                   agentEmail: 1,
//                 },
//               },
//             },
//           ])
//           .toArray();

//         res.json(offers);
//       } catch (error) {
//         console.error("Get offers error:", error);
//         res.status(500).json({ error: "Failed to get offers" });
//       }
//     });

//     // DELETE OFFER
//     app.delete("/offers/:id", async (req, res) => {
//       const id = req.params.id;

//       if (!ObjectId.isValid(id)) {
//         return res.status(400).json({ error: "Invalid offer ID" });
//       }

//       try {
//         const result = await offersCollection.deleteOne({ _id: new ObjectId(id) });

//         if (result.deletedCount === 0) {
//           return res.status(404).json({ error: "Offer not found" });
//         }

//         res.json({ message: "Offer deleted successfully" });
//       } catch (error) {
//         console.error("Delete offer error:", error);
//         res.status(500).json({ error: "Internal server error" });
//       }
//     });

//     // UPDATE OFFER STATUS
//     app.patch("/offers/:id/status", async (req, res) => {
//       const offerId = req.params.id;
//       const { status } = req.body;

//       if (!["approved", "rejected"].includes(status)) {
//         return res.status(400).json({ error: "Invalid status value" });
//       }

//       if (!ObjectId.isValid(offerId)) {
//         return res.status(400).json({ error: "Invalid offer ID" });
//       }

//       try {
//         const offer = await offersCollection.findOne({ _id: new ObjectId(offerId) });

//         if (!offer) {
//           return res.status(404).json({ error: "Offer not found" });
//         }

//         // Update the selected offer status
//         await offersCollection.updateOne(
//           { _id: new ObjectId(offerId) },
//           { $set: { status } }
//         );

//         // If approved, reject all other offers for this property
//         if (status === "approved") {
//           await offersCollection.updateMany(
//             {
//               _id: { $ne: new ObjectId(offerId) },
//               propertyId: offer.propertyId,
//             },
//             { $set: { status: "rejected" } }
//           );
//         }

//         res.json({ message: `Offer ${status}` });
//       } catch (error) {
//         console.error("Update offer status error:", error);
//         res.status(500).json({ error: "Failed to update offer status" });
//       }
//     });


    




//     // AGENT OFFERS ROUTE
//     app.get("/agent/offers", async (req, res) => {
//       const agentEmail = req.query.agentEmail;
//       if (!agentEmail) return res.status(400).json({ error: "Missing agentEmail query param" });

//       try {
//         // Find all properties by this agent
//         const agentProperties = await propertiesCollection
//           .find({ agentEmail })
//           .project({ _id: 1 })
//           .toArray();

//         const propertyIds = agentProperties.map((p) => p._id);

//         if (propertyIds.length === 0) return res.json([]); // no properties, no offers

//         // Find all offers on those properties
//         const offers = await offersCollection
//           .aggregate([
//             { $match: { propertyId: { $in: propertyIds } } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//             {
//               $project: {
//                 _id: 1,
//                 offerPrice: 1,
//                 createdAt: 1,
//                 userEmail: 1,
//                 status: 1,
//                 property: {
//                   _id: 1,
//                   title: 1,
//                   location: 1,
//                   priceRange: 1,
//                   agentEmail: 1,
//                 },
//               },
//             },
//           ])
//           .toArray();

//         res.json(offers);
//       } catch (error) {
//         console.error("Get agent offers error:", error);
//         res.status(500).json({ error: "Failed to get offers for agent" });
//       }
//     });

//     // ROOT ROUTE
//     app.get("/", (req, res) => {
//       res.send("🏡 Real Estate Server is Running with Wishlist, Role & Offers System!");
//     });

//     // START SERVER
//     app.listen(port, () => {
//       console.log(`🚀 Server running on port ${port}`);
//     });

//     // Graceful shutdown
//     process.on("SIGINT", async () => {
//       await client.close();
//       console.log("MongoDB connection closed");
//       process.exit(0);
//     });
//   } catch (err) {
//     console.error("❌ MongoDB connection failed:", err);
//   }
// }

// run();



// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// dotenv.config();

// const app = express();
// const port = process.env.PORT || 5000;

// // Middleware
// app.use(
//   cors({
//     origin: "http://localhost:5173", // Your frontend URL, change if needed
//     credentials: true,
//   })
// );
// app.use(express.json());

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djvkmk5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// async function run() {
//   try {
//     await client.connect();
//     console.log("✅ Connected to MongoDB");

//     const db = client.db("realestate");
//     const usersCollection = db.collection("users");
//     const propertiesCollection = db.collection("properties");
//     const reviewsCollection = db.collection("reviews");
//     const wishlistCollection = db.collection("wishlists");
//     const offersCollection = db.collection("offers");

//     // ===== USER ROUTES =====

//     // Add or update user
//     app.post("/users", async (req, res) => {
//       try {
//         const user = req.body;
//         if (!user.email) return res.status(400).json({ error: "Email is required" });

//         const existingUser = await usersCollection.findOne({ email: user.email });

//         // Role priority: role in request > existing role > "user"
//         const roleToSet = user.role || (existingUser ? existingUser.role : "user");

//         const updateData = {
//           name: user.name || (existingUser ? existingUser.name : ""),
//           email: user.email,
//           photoURL: user.photoURL || (existingUser ? existingUser.photoURL : ""),
//           role: roleToSet,
//         };

//         const result = await usersCollection.updateOne(
//           { email: user.email },
//           { $set: updateData },
//           { upsert: true }
//         );

//         res.json({ message: "User saved/updated", role: roleToSet, result });
//       } catch (error) {
//         console.error("Add/update user error:", error);
//         res.status(500).json({ error: "Failed to add/update user" });
//       }
//     });

//     // Get user role by email
//     app.get("/users/:email", async (req, res) => {
//       try {
//         const email = req.params.email;
//         if (!email) return res.status(400).json({ error: "Email is required" });

//         const user = await usersCollection.findOne({ email });
//         if (!user) return res.json({ role: "user" });

//         res.json({ role: user.role });
//       } catch (error) {
//         console.error("Get user role error:", error);
//         res.status(500).json({ error: "Failed to get user role" });
//       }
//     });

//     // Update user role
//     app.patch("/users/role/:id", async (req, res) => {
//       try {
//         const id = req.params.id;
//         const { role } = req.body;

//         if (!role) return res.status(400).json({ error: "Role is required" });
//         if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid user ID" });

//         // Optional: Validate allowed roles
//         const allowedRoles = ["user", "admin", "agent", "fraud"];
//         if (!allowedRoles.includes(role)) {
//           return res.status(400).json({ error: "Invalid role value" });
//         }

//         const result = await usersCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { role } }
//         );

//         if (result.matchedCount === 0) return res.status(404).json({ error: "User not found" });

//         res.json({ message: "User role updated", result });
//       } catch (error) {
//         console.error("Set user role error:", error);
//         res.status(500).json({ error: "Failed to update user role" });
//       }
//     });

//     // Get all users
//     app.get("/users", async (req, res) => {
//       try {
//         const users = await usersCollection.find().toArray();
//         res.json(users);
//       } catch (error) {
//         console.error("Failed to fetch users", error);
//         res.status(500).json({ error: "Failed to fetch users" });
//       }
//     });

//     // Delete user
//     app.delete("/users/:id", async (req, res) => {
//       try {
//         const userId = req.params.id;

//         if (!ObjectId.isValid(userId)) return res.status(400).json({ error: "Invalid user ID" });

//         // Optionally, fetch user to get Firebase UID for deletion from Firebase Auth
//         // const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
//         // if (user.firebaseUid) {
//         //   await admin.auth().deleteUser(user.firebaseUid); // requires Firebase Admin SDK setup
//         // }

//         const result = await usersCollection.deleteOne({ _id: new ObjectId(userId) });

//         if (result.deletedCount === 0) return res.status(404).json({ error: "User not found" });

//         res.json({ message: "User deleted successfully" });
//       } catch (error) {
//         console.error("Delete user error:", error);
//         res.status(500).json({ error: "Failed to delete user" });
//       }
//     });

//     // ===== PROPERTIES ROUTES =====

//     app.get("/properties", async (req, res) => {
//       try {
//         const { agentEmail } = req.query;
//         const query = agentEmail ? { agentEmail } : {};
//         const properties = await propertiesCollection.find(query).toArray();
//         res.json(properties);
//       } catch (error) {
//         console.error("Error fetching properties:", error);
//         res.status(500).json({ error: "Failed to fetch properties" });
//       }
//     });

//     app.post("/properties", async (req, res) => {
//       try {
//         const property = req.body;
//         if (
//           !property.title ||
//           !property.location ||
//           !property.priceRange ||
//           !property.agentEmail
//         ) {
//           return res.status(400).json({ error: "Missing required fields" });
//         }
//         property.createdAt = new Date();

//         const result = await propertiesCollection.insertOne(property);
//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add property error:", error);
//         res.status(500).json({ error: "Failed to add property" });
//       }
//     });

//     app.get("/properties/:id", async (req, res) => {
//       const { id } = req.params;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid property ID format" });

//       try {
//         const property = await propertiesCollection.findOne({ _id: new ObjectId(id) });
//         if (!property) return res.status(404).json({ error: "Property not found" });
//         res.json(property);
//       } catch (error) {
//         console.error("Get property error:", error);
//         res.status(500).json({ error: "Failed to get property" });
//       }
//     });

//     app.patch("/properties/:id/status", async (req, res) => {
//       const { id } = req.params;
//       const { status } = req.body;

//       if (!["verified", "rejected"].includes(status)) {
//         return res.status(400).json({ message: "Invalid status" });
//       }

//       if (!ObjectId.isValid(id)) {
//         return res.status(400).json({ message: "Invalid property ID" });
//       }

//       try {
//         const result = await propertiesCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { status } }
//         );

//         if (result.modifiedCount === 1) {
//           res.json({ message: "Status updated successfully" });
//         } else {
//           res.status(404).json({ message: "Property not found" });
//         }
//       } catch (error) {
//         console.error("Error updating property status:", error);
//         res.status(500).json({ message: "Internal server error" });
//       }
//     });

//     app.delete("/properties/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid property ID" });

//       try {
//         const result = await propertiesCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).json({ error: "Property not found" });
//         res.json({ message: "Property deleted successfully" });
//       } catch (error) {
//         console.error("Delete property error:", error);
//         res.status(500).json({ error: "Internal server error" });
//       }
//     });




    
//     // ===== WISHLIST ROUTES =====

//     app.post("/wishlist", async (req, res) => {
//       const { userEmail, propertyId } = req.body;
//       if (!userEmail || !propertyId) return res.status(400).json({ error: "Missing userEmail or propertyId" });

//       if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid propertyId format" });

//       try {
//         const exists = await wishlistCollection.findOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//         });

//         if (exists) return res.status(409).json({ message: "Already in wishlist" });

//         const result = await wishlistCollection.insertOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//           createdAt: new Date(),
//         });

//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add to wishlist error:", error);
//         res.status(500).json({ error: "Failed to add to wishlist" });
//       }
//     });

//     app.get("/wishlist", async (req, res) => {
//       const { userEmail } = req.query;
//       if (!userEmail) return res.status(400).json({ error: "Missing userEmail" });

//       try {
//         const items = await wishlistCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//           ])
//           .toArray();

//         res.json(items);
//       } catch (error) {
//         console.error("Get wishlist error:", error);
//         res.status(500).json({ error: "Failed to get wishlist" });
//       }
//     });

//     app.delete("/wishlist/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid wishlist item ID" });

//       try {
//         const result = await wishlistCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).json({ error: "Wishlist item not found" });
//         res.json({ message: "Removed from wishlist" });
//       } catch (error) {
//         console.error("Delete wishlist error:", error);
//         res.status(500).json({ error: "Failed to delete from wishlist" });
//       }
//     });

//     // ===== REVIEWS ROUTES =====

//     app.get("/reviews/user/:email", async (req, res) => {
//       const email = req.params.email;
//       try {
//         const reviews = await reviewsCollection.find({ userEmail: email }).toArray();
//         if (!reviews.length) return res.status(404).json({ message: "No reviews found for this user" });
//         res.json(reviews);
//       } catch (error) {
//         console.error("Error fetching user reviews:", error);
//         res.status(500).json({ error: "Failed to get user reviews" });
//       }
//     });

//     app.delete("/reviews/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid review ID" });

//       try {
//         const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).json({ message: "Review not found" });
//         res.json({ success: true, message: "Review deleted successfully" });
//       } catch (error) {
//         console.error("Delete review error:", error);
//         res.status(500).json({ error: "Failed to delete review" });
//       }
//     });

//     app.get("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid property ID" });

//       try {
//         // Reviews store propertyId as string for consistency
//         const reviews = await reviewsCollection.find({ propertyId }).toArray();
//         res.json(reviews);
//       } catch (error) {
//         console.error("Get reviews error:", error);
//         res.status(500).json({ error: "Failed to fetch reviews" });
//       }
//     });

//     app.post("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       const review = req.body;

//       if (!ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Invalid property ID" });
//       if (!review.userEmail || !review.comment) return res.status(400).json({ error: "Missing review fields" });

//       review.propertyId = propertyId; // store as string for consistency
//       review.createdAt = new Date();

//       try {
//         const result = await reviewsCollection.insertOne(review);
//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add review error:", error);
//         res.status(500).json({ error: "Failed to add review" });
//       }
//     });

//     app.get("/reviews/latest", async (req, res) => {
//       try {
//         const latestReviews = await reviewsCollection
//           .aggregate([
//             { $sort: { createdAt: -1 } },
//             { $limit: 3 },
//             {
//               $lookup: {
//                 from: "users",
//                 localField: "userEmail",
//                 foreignField: "email",
//                 as: "user",
//               },
//             },
//             { $unwind: "$user" },
//             {
//               $addFields: {
//                 propertyObjectId: { $toObjectId: "$propertyId" },
//               },
//             },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyObjectId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//             {
//               $project: {
//                 _id: 1,
//                 comment: 1,
//                 createdAt: 1,
//                 "user.name": 1,
//                 "user.photoURL": 1,
//                 "property.title": 1,
//               },
//             },
//           ])
//           .toArray();

//         res.json(latestReviews);
//       } catch (error) {
//         console.error("Failed to get latest reviews:", error);
//         res.status(500).json({ error: "Failed to get latest reviews" });
//       }
//     });

//     // ===== OFFERS ROUTES =====

//     app.post("/offers", async (req, res) => {
//       try {
//         const offer = req.body;
//         if (!offer.userEmail || !offer.propertyId || !offer.offerPrice)
//           return res.status(400).json({ success: false, error: "Missing required fields" });

//         offer.createdAt = new Date();

//         if (typeof offer.propertyId === "string" && ObjectId.isValid(offer.propertyId)) {
//           offer.propertyId = new ObjectId(offer.propertyId);
//         } else if (!(offer.propertyId instanceof ObjectId)) {
//           return res.status(400).json({ error: "Invalid propertyId format" });
//         }

//         const result = await offersCollection.insertOne(offer);
//         res.status(201).json({ success: true, insertedId: result.insertedId });
//       } catch (error) {
//         console.error("Add offer error:", error);
//         res.status(500).json({ success: false, error: "Failed to add offer" });
//       }
//     });

//     app.get("/offers", async (req, res) => {
//       const userEmail = req.query.email;
//       if (!userEmail) return res.status(400).json({ error: "Missing userEmail query param" });

//       try {
//         const offers = await offersCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             {
//               $addFields: {
//                 property: { $arrayElemAt: ["$property", 0] },
//               },
//             },
//             {
//               $project: {
//                 _id: 1,
//                 offerPrice: 1,
//                 createdAt: 1,
//                 status: 1,
//                 message: 1,
//                 property: {
//                   _id: 1,
//                   title: 1,
//                   location: 1,
//                   priceRange: 1,
//                   agentEmail: 1,
//                 },
//               },
//             },
//           ])
//           .toArray();

//         res.json(offers);
//       } catch (error) {
//         console.error("Get offers error:", error);
//         res.status(500).json({ error: "Failed to get offers" });
//       }
//     });

//     // DELETE OFFER
//     app.delete("/offers/:id", async (req, res) => {
//       const id = req.params.id;

//       if (!ObjectId.isValid(id)) {
//         return res.status(400).json({ error: "Invalid offer ID" });
//       }

//       try {
//         const result = await offersCollection.deleteOne({ _id: new ObjectId(id) });

//         if (result.deletedCount === 0) {
//           return res.status(404).json({ error: "Offer not found" });
//         }

//         res.json({ message: "Offer deleted successfully" });
//       } catch (error) {
//         console.error("Delete offer error:", error);
//         res.status(500).json({ error: "Internal server error" });
//       }
//     });

//     // UPDATE OFFER STATUS
//     app.patch("/offers/:id/status", async (req, res) => {
//       const offerId = req.params.id;
//       const { status } = req.body;

//       if (!["approved", "rejected"].includes(status)) {
//         return res.status(400).json({ error: "Invalid status value" });
//       }

//       if (!ObjectId.isValid(offerId)) {
//         return res.status(400).json({ error: "Invalid offer ID" });
//       }

//       try {
//         const offer = await offersCollection.findOne({ _id: new ObjectId(offerId) });

//         if (!offer) {
//           return res.status(404).json({ error: "Offer not found" });
//         }

//         // Update the selected offer status
//         await offersCollection.updateOne(
//           { _id: new ObjectId(offerId) },
//           { $set: { status } }
//         );

//         // If approved, reject all other offers for this property
//         if (status === "approved") {
//           await offersCollection.updateMany(
//             {
//               _id: { $ne: new ObjectId(offerId) },
//               propertyId: offer.propertyId,
//             },
//             { $set: { status: "rejected" } }
//           );
//         }

//         res.json({ message: `Offer ${status}` });
//       } catch (error) {
//         console.error("Update offer status error:", error);
//         res.status(500).json({ error: "Failed to update offer status" });
//       }
//     });

//     // AGENT OFFERS ROUTE
//     app.get("/agent/offers", async (req, res) => {
//       const agentEmail = req.query.agentEmail;
//       if (!agentEmail) return res.status(400).json({ error: "Missing agentEmail query param" });

//       try {
//         // Find all properties by this agent
//         const agentProperties = await propertiesCollection
//           .find({ agentEmail })
//           .project({ _id: 1 })
//           .toArray();

//         const propertyIds = agentProperties.map((p) => p._id);

//         if (propertyIds.length === 0) return res.json([]); // no properties, no offers

//         // Find all offers on those properties
//         const offers = await offersCollection
//           .aggregate([
//             { $match: { propertyId: { $in: propertyIds } } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//             {
//               $project: {
//                 _id: 1,
//                 offerPrice: 1,
//                 createdAt: 1,
//                 userEmail: 1,
//                 status: 1,
//                 property: {
//                   _id: 1,
//                   title: 1,
//                   location: 1,
//                   priceRange: 1,
//                   agentEmail: 1,
//                 },
//               },
//             },
//           ])
//           .toArray();

//         res.json(offers);
//       } catch (error) {
//         console.error("Get agent offers error:", error);
//         res.status(500).json({ error: "Failed to get offers for agent" });
//       }
//     });

//     // ROOT ROUTE
//     app.get("/", (req, res) => {
//       res.send("🏡 Real Estate Server is Running with Wishlist, Role & Offers System!");
//     });

//     // START SERVER
//     app.listen(port, () => {
//       console.log(`🚀 Server running on port ${port}`);
//     });

//     // Graceful shutdown
//     process.on("SIGINT", async () => {
//       await client.close();
//       console.log("MongoDB connection closed");
//       process.exit(0);
//     });
//   } catch (err) {
//     console.error("❌ MongoDB connection failed:", err);
//   }
// }

// run();



// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// dotenv.config();

// const app = express();
// const port = process.env.PORT || 5000;

// // Middleware
// app.use(
//   cors({
//     origin: "http://localhost:5173", // your frontend URL
//     credentials: true,
//   })
// );
// app.use(express.json());

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djvkmk5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// async function run() {
//   try {
//     await client.connect();
//     console.log("✅ Connected to MongoDB");

//     const db = client.db("realestate");
//     const usersCollection = db.collection("users");
//     const propertiesCollection = db.collection("properties");
//     const reviewsCollection = db.collection("reviews");
//     const wishlistCollection = db.collection("wishlists");
//     const offersCollection = db.collection("offers");

//     // ===== USER ROUTES =====

//     // Add or update user
//     app.post("/users", async (req, res) => {
//       try {
//         const user = req.body;
//         if (!user.email)
//           return res.status(400).json({ error: "Email is required" });

//         const existingUser = await usersCollection.findOne({ email: user.email });

//         // Role priority: if role provided in request, use it,
//         // else keep existing role or default "user"
//         const roleToSet = user.role || (existingUser ? existingUser.role : "user");

//         const updateData = {
//           name: user.name || (existingUser ? existingUser.name : ""),
//           email: user.email,
//           photoURL: user.photoURL || (existingUser ? existingUser.photoURL : ""),
//           role: roleToSet,
//         };

//         const result = await usersCollection.updateOne(
//           { email: user.email },
//           { $set: updateData },
//           { upsert: true }
//         );

//         res.json({ message: "User saved/updated", role: roleToSet, result });
//       } catch (error) {
//         console.error("Add/update user error:", error);
//         res.status(500).json({ error: "Failed to add/update user" });
//       }
//     });

//     // Get user role by email
//     app.get("/users/:email", async (req, res) => {
//       try {
//         const email = req.params.email;
//         if (!email)
//           return res.status(400).json({ error: "Email is required" });

//         const user = await usersCollection.findOne({ email });
//         if (!user) return res.json({ role: "user" });
//         res.json({ role: user.role });
//       } catch (error) {
//         console.error("Get user role error:", error);
//         res.status(500).json({ error: "Failed to get user role" });
//       }
//     });

//     // Update user role
//     app.patch("/users/role/:id", async (req, res) => {
//       try {
//         const id = req.params.id;
//         const { role } = req.body;

//         if (!role)
//           return res.status(400).json({ error: "Role is required" });
//         if (!ObjectId.isValid(id))
//           return res.status(400).json({ error: "Invalid user ID" });

//         const result = await usersCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { role } }
//         );

//         if (result.matchedCount === 0)
//           return res.status(404).json({ error: "User not found" });

//         res.json({ message: "User role updated", result });
//       } catch (error) {
//         console.error("Set user role error:", error);
//         res.status(500).json({ error: "Failed to update user role" });
//       }
//     });

//     // Get all users
//     app.get("/users", async (req, res) => {
//       try {
//         const users = await usersCollection.find().toArray();
//         res.json(users);
//       } catch (error) {
//         console.error("Failed to fetch users", error);
//         res.status(500).json({ error: "Failed to fetch users" });
//       }
//     });

//     // Delete user (IMPORTANT: Fix here)
//     app.delete("/users/:id", async (req, res) => {
//       try {
//         const userId = req.params.id;

//         if (!ObjectId.isValid(userId))
//           return res.status(400).json({ error: "Invalid user ID" });

//         const result = await usersCollection.deleteOne({ _id: new ObjectId(userId) });

//         if (result.deletedCount === 0)
//           return res.status(404).json({ error: "User not found" });

//         // TODO: If deleting from Firebase Auth, add Firebase Admin SDK delete here
//         // Example:
//         // if (user.firebaseUid) await admin.auth().deleteUser(user.firebaseUid);

//         res.json({ message: "User deleted successfully" });
//       } catch (error) {
//         console.error("Delete user error:", error);
//         res.status(500).json({ error: "Failed to delete user" });
//       }
//     });

//     // ===== PROPERTIES ROUTES =====

//     app.get("/properties", async (req, res) => {
//       try {
//         const { agentEmail } = req.query;
//         const query = agentEmail ? { agentEmail } : {};
//         const properties = await propertiesCollection.find(query).toArray();
//         res.json(properties);
//       } catch (error) {
//         console.error("Error fetching properties:", error);
//         res.status(500).json({ error: "Failed to fetch properties" });
//       }
//     });

//     app.post("/properties", async (req, res) => {
//       try {
//         const property = req.body;
//         if (
//           !property.title ||
//           !property.location ||
//           !property.priceRange ||
//           !property.agentEmail
//         ) {
//           return res.status(400).json({ error: "Missing required fields" });
//         }
//         property.createdAt = new Date();

//         const result = await propertiesCollection.insertOne(property);
//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add property error:", error);
//         res.status(500).json({ error: "Failed to add property" });
//       }
//     });

//     app.get("/properties/:id", async (req, res) => {
//       const { id } = req.params;
//       if (!ObjectId.isValid(id))
//         return res.status(400).json({ error: "Invalid property ID format" });

//       try {
//         const property = await propertiesCollection.findOne({ _id: new ObjectId(id) });
//         if (!property) return res.status(404).json({ error: "Property not found" });
//         res.json(property);
//       } catch (error) {
//         console.error("Get property error:", error);
//         res.status(500).json({ error: "Failed to get property" });
//       }
//     });

//     app.patch("/properties/:id/status", async (req, res) => {
//       const { id } = req.params;
//       const { status } = req.body;

//       if (!["verified", "rejected"].includes(status)) {
//         return res.status(400).json({ message: "Invalid status" });
//       }

//       if (!ObjectId.isValid(id)) {
//         return res.status(400).json({ message: "Invalid property ID" });
//       }

//       try {
//         const result = await propertiesCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { status } }
//         );

//         if (result.modifiedCount === 1) {
//           res.json({ message: "Status updated successfully" });
//         } else {
//           res.status(404).json({ message: "Property not found" });
//         }
//       } catch (error) {
//         console.error("Error updating property status:", error);
//         res.status(500).json({ message: "Internal server error" });
//       }
//     });

//     app.delete("/properties/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id))
//         return res.status(400).json({ error: "Invalid property ID" });

//       try {
//         const result = await propertiesCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0)
//           return res.status(404).json({ error: "Property not found" });
//         res.json({ message: "Property deleted successfully" });
//       } catch (error) {
//         console.error("Delete property error:", error);
//         res.status(500).json({ error: "Internal server error" });
//       }
//     });

//     // ===== WISHLIST ROUTES =====

//     app.post("/wishlist", async (req, res) => {
//       const { userEmail, propertyId } = req.body;
//       if (!userEmail || !propertyId)
//         return res.status(400).json({ error: "Missing userEmail or propertyId" });

//       if (!ObjectId.isValid(propertyId))
//         return res.status(400).json({ error: "Invalid propertyId format" });

//       try {
//         const exists = await wishlistCollection.findOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//         });

//         if (exists) return res.status(409).json({ message: "Already in wishlist" });

//         const result = await wishlistCollection.insertOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//           createdAt: new Date(),
//         });

//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add to wishlist error:", error);
//         res.status(500).json({ error: "Failed to add to wishlist" });
//       }
//     });

//     app.get("/wishlist", async (req, res) => {
//       const { userEmail } = req.query;
//       if (!userEmail) return res.status(400).json({ error: "Missing userEmail" });

//       try {
//         const items = await wishlistCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//           ])
//           .toArray();

//         res.json(items);
//       } catch (error) {
//         console.error("Get wishlist error:", error);
//         res.status(500).json({ error: "Failed to get wishlist" });
//       }
//     });

//     app.delete("/wishlist/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id))
//         return res.status(400).json({ error: "Invalid wishlist item ID" });

//       try {
//         const result = await wishlistCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0)
//           return res.status(404).json({ error: "Wishlist item not found" });
//         res.json({ message: "Removed from wishlist" });
//       } catch (error) {
//         console.error("Delete wishlist error:", error);
//         res.status(500).json({ error: "Failed to delete from wishlist" });
//       }
//     });

//     // ===== REVIEWS ROUTES =====

//     app.get("/reviews/user/:email", async (req, res) => {
//       const email = req.params.email;
//       try {
//         const reviews = await reviewsCollection.find({ userEmail: email }).toArray();
//         if (!reviews.length)
//           return res.status(404).json({ message: "No reviews found for this user" });
//         res.json(reviews);
//       } catch (error) {
//         console.error("Error fetching user reviews:", error);
//         res.status(500).json({ error: "Failed to get user reviews" });
//       }
//     });

//     app.delete("/reviews/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id))
//         return res.status(400).json({ error: "Invalid review ID" });

//       try {
//         const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0)
//           return res.status(404).json({ message: "Review not found" });
//         res.json({ success: true, message: "Review deleted successfully" });
//       } catch (error) {
//         console.error("Delete review error:", error);
//         res.status(500).json({ error: "Failed to delete review" });
//       }
//     });

//     app.get("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       if (!ObjectId.isValid(propertyId))
//         return res.status(400).json({ error: "Invalid property ID" });

//       try {
//         // Reviews store propertyId as string for consistency
//         const reviews = await reviewsCollection.find({ propertyId }).toArray();
//         res.json(reviews);
//       } catch (error) {
//         console.error("Get reviews error:", error);
//         res.status(500).json({ error: "Failed to fetch reviews" });
//       }
//     });

//     app.post("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       const review = req.body;

//       if (!ObjectId.isValid(propertyId))
//         return res.status(400).json({ error: "Invalid property ID" });
//       if (!review.userEmail || !review.comment)
//         return res.status(400).json({ error: "Missing review fields" });

//       review.propertyId = propertyId; // store as string for consistency
//       review.createdAt = new Date();

//       try {
//         const result = await reviewsCollection.insertOne(review);
//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add review error:", error);
//         res.status(500).json({ error: "Failed to add review" });
//       }
//     });

//     app.get("/reviews/latest", async (req, res) => {
//       try {
//         const latestReviews = await reviewsCollection
//           .aggregate([
//             { $sort: { createdAt: -1 } },
//             { $limit: 3 },
//             {
//               $lookup: {
//                 from: "users",
//                 localField: "userEmail",
//                 foreignField: "email",
//                 as: "user",
//               },
//             },
//             { $unwind: "$user" },
//             {
//               $addFields: {
//                 propertyObjectId: { $toObjectId: "$propertyId" },
//               },
//             },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyObjectId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//             {
//               $project: {
//                 _id: 1,
//                 comment: 1,
//                 createdAt: 1,
//                 "user.name": 1,
//                 "user.photoURL": 1,
//                 "property.title": 1,
//               },
//             },
//           ])
//           .toArray();

//         res.json(latestReviews);
//       } catch (error) {
//         console.error("Failed to get latest reviews:", error);
//         res.status(500).json({ error: "Failed to get latest reviews" });
//       }
//     });

//     // ===== OFFERS ROUTES =====

//     app.post("/offers", async (req, res) => {
//       try {
//         const offer = req.body;
//         if (!offer.userEmail || !offer.propertyId || !offer.offerPrice)
//           return res.status(400).json({ success: false, error: "Missing required fields" });

//         offer.createdAt = new Date();

//         if (typeof offer.propertyId === "string" && ObjectId.isValid(offer.propertyId)) {
//           offer.propertyId = new ObjectId(offer.propertyId);
//         } else if (!(offer.propertyId instanceof ObjectId)) {
//           return res.status(400).json({ error: "Invalid propertyId format" });
//         }

//         const result = await offersCollection.insertOne(offer);
//         res.status(201).json({ success: true, insertedId: result.insertedId });
//       } catch (error) {
//         console.error("Add offer error:", error);
//         res.status(500).json({ success: false, error: "Failed to add offer" });
//       }
//     });

//     app.get("/offers", async (req, res) => {
//       const userEmail = req.query.email;
//       if (!userEmail) return res.status(400).json({ error: "Missing userEmail query param" });

//       try {
//         const offers = await offersCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             {
//               $addFields: {
//                 property: { $arrayElemAt: ["$property", 0] },
//               },
//             },
//             {
//               $project: {
//                 _id: 1,
//                 offerPrice: 1,
//                 createdAt: 1,
//                 status: 1,
//                 message: 1,
//                 property: {
//                   _id: 1,
//                   title: 1,
//                   location: 1,
//                   priceRange: 1,
//                   agentEmail: 1,
//                 },
//               },
//             },
//           ])
//           .toArray();

//         res.json(offers);
//       } catch (error) {
//         console.error("Get offers error:", error);
//         res.status(500).json({ error: "Failed to get offers" });
//       }
//     });

//     // DELETE OFFER

//     app.delete("/offers/:id", async (req, res) => {
//       const id = req.params.id;

//       if (!ObjectId.isValid(id)) {
//         return res.status(400).json({ error: "Invalid offer ID" });
//       }

//       try {
//         const result = await offersCollection.deleteOne({ _id: new ObjectId(id) });

//         if (result.deletedCount === 0) {
//           return res.status(404).json({ error: "Offer not found" });
//         }

//         res.json({ message: "Offer deleted successfully" });
//       } catch (error) {
//         console.error("Delete offer error:", error);
//         res.status(500).json({ error: "Internal server error" });
//       }
//     });

//     // UPDATE OFFER STATUS

//     app.patch("/offers/:id/status", async (req, res) => {
//       const offerId = req.params.id;
//       const { status } = req.body;

//       if (!["approved", "rejected"].includes(status)) {
//         return res.status(400).json({ error: "Invalid status value" });
//       }

//       if (!ObjectId.isValid(offerId)) {
//         return res.status(400).json({ error: "Invalid offer ID" });
//       }

//       try {
//         const offer = await offersCollection.findOne({ _id: new ObjectId(offerId) });

//         if (!offer) {
//           return res.status(404).json({ error: "Offer not found" });
//         }

//         // Update the selected offer status
//         await offersCollection.updateOne(
//           { _id: new ObjectId(offerId) },
//           { $set: { status } }
//         );

//         // If accepted, reject all other offers for this property
//         if (status === "approved") {
//           await offersCollection.updateMany(
//             {
//               _id: { $ne: new ObjectId(offerId) },
//               propertyId: offer.propertyId,
//             },
//             { $set: { status: "rejected" } }
//           );
//         }

//         res.json({ message: `Offer ${status}` });
//       } catch (error) {
//         console.error("Update offer status error:", error);
//         res.status(500).json({ error: "Failed to update offer status" });
//       }
//     });

//     // AGENT OFFERS ROUTE

//     app.get("/agent/offers", async (req, res) => {
//       const agentEmail = req.query.agentEmail;
//       if (!agentEmail) return res.status(400).json({ error: "Missing agentEmail query param" });

//       try {
//         // Find all properties by this agent
//         const agentProperties = await propertiesCollection
//           .find({ agentEmail })
//           .project({ _id: 1 })
//           .toArray();

//         const propertyIds = agentProperties.map((p) => p._id);

//         if (propertyIds.length === 0) return res.json([]); // no properties, no offers

//         // Find all offers on those properties
//         const offers = await offersCollection
//           .aggregate([
//             { $match: { propertyId: { $in: propertyIds } } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//             {
//               $project: {
//                 _id: 1,
//                 offerPrice: 1,
//                 createdAt: 1,
//                 userEmail: 1,
//                 status: 1,
//                 property: {
//                   _id: 1,
//                   title: 1,
//                   location: 1,
//                   priceRange: 1,
//                   agentEmail: 1,
//                 },
//               },
//             },
//           ])
//           .toArray();

//         res.json(offers);
//       } catch (error) {
//         console.error("Get agent offers error:", error);
//         res.status(500).json({ error: "Failed to get offers for agent" });
//       }
//     });

//     // ROOT ROUTE

//     app.get("/", (req, res) => {
//       res.send("🏡 Real Estate Server is Running with Wishlist, Role & Offers System!");
//     });

//     // START SERVER
//     app.listen(port, () => {
//       console.log(`🚀 Server running on port ${port}`);
//     });

//     // Graceful shutdown
//     process.on("SIGINT", async () => {
//       await client.close();
//       console.log("MongoDB connection closed");
//       process.exit(0);
//     });
//   } catch (err) {
//     console.error("❌ MongoDB connection failed:", err);
//   }
// }

// run();




// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// dotenv.config();

// const app = express();
// const port = process.env.PORT || 5000;

// // Middleware
// app.use(
//   cors({
//     origin: "http://localhost:5173", // frontend URL
//     credentials: true,
//   })
// );
// app.use(express.json());

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djvkmk5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// async function run() {
//   try {
//     await client.connect();
//     console.log("✅ Connected to MongoDB");

//     const db = client.db("realestate");
//     const usersCollection = db.collection("users");
//     const propertiesCollection = db.collection("properties");
//     const reviewsCollection = db.collection("reviews");
//     const wishlistCollection = db.collection("wishlists");
//     const offersCollection = db.collection("offers");

//     // ===== USER ROUTES =====

//     app.post("/users", async (req, res) => {
//       try {
//         const user = req.body;
//         if (!user.email)
//           return res.status(400).json({ error: "Email is required" });

//         const existingUser = await usersCollection.findOne({ email: user.email });

//         // If role provided in request, use it, else keep existing or default "user"
//         const roleToSet = user.role || (existingUser ? existingUser.role : "user");

//         const updateData = {
//           name: user.name || (existingUser ? existingUser.name : ""),
//           email: user.email,
//           photoURL: user.photoURL || (existingUser ? existingUser.photoURL : ""),
//           role: roleToSet,
//         };

//         const result = await usersCollection.updateOne(
//           { email: user.email },
//           { $set: updateData },
//           { upsert: true }
//         );

//         res.json({ message: "User saved/updated", role: roleToSet, result });
//       } catch (error) {
//         console.error("Add/update user error:", error);
//         res.status(500).json({ error: "Failed to add/update user" });
//       }
//     });

//     app.get("/users/:email", async (req, res) => {
//       try {
//         const email = req.params.email;
//         if (!email)
//           return res.status(400).json({ error: "Email is required" });

//         const user = await usersCollection.findOne({ email });
//         if (!user) return res.json({ role: "user" });
//         res.json({ role: user.role });
//       } catch (error) {
//         console.error("Get user role error:", error);
//         res.status(500).json({ error: "Failed to get user role" });
//       }
//     });

//     app.patch("/users/role/:id", async (req, res) => {
//       try {
//         const id = req.params.id;
//         const { role } = req.body;

//         if (!role)
//           return res.status(400).json({ error: "Role is required" });
//         if (!ObjectId.isValid(id))
//           return res.status(400).json({ error: "Invalid user ID" });

//         const result = await usersCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { role } }
//         );

//         if (result.matchedCount === 0)
//           return res.status(404).json({ error: "User not found" });

//         res.json({ message: "User role updated", result });
//       } catch (error) {
//         console.error("Set user role error:", error);
//         res.status(500).json({ error: "Failed to update user role" });
//       }
//     });


//     app.get("/users", async (req, res) => {
//   try {
//     const users = await usersCollection.find().toArray();
//     res.json(users);
//   } catch (error) {
//     console.error("Failed to fetch users", error);
//     res.status(500).json({ error: "Failed to fetch users" });
//   }
// });

// // //////
// // PATCH /properties/:id/status
// app.patch("/properties/:id/status", async (req, res) => {
//   const { id } = req.params;
//   const { status } = req.body; // expected: "verified" or "rejected"

//   if (!["verified", "rejected"].includes(status)) {
//     return res.status(400).json({ message: "Invalid status" });
//   }

//   try {
//     const result = await propertiesCollection.updateOne(
//       { _id: new ObjectId(id) },
//       { $set: { status: status } }
//     );

//     if (result.modifiedCount === 1) {
//       return res.json({ message: "Status updated successfully" });
//     } else {
//       return res.status(404).json({ message: "Property not found" });
//     }
//   } catch (error) {
//     console.error("Error updating property status:", error);
//     res.status(500).json({ message: "Internal server error" });
//   }
// });

// // Update role e alert and console:
// const updateRole = async (id, role) => {
//   try {
//     const res = await axios.patch(`http://localhost:5000/users/role/${id}`, { role });
//     if (res.status === 200) {
//       fetchUsers();
//     } else {
//       alert("Failed to update role");
//     }
//   } catch (error) {
//     console.error("Failed to update role", error);
//     alert("Error updating role");
//   }
// };
// // Backend route example (Express.js)
// // Update role
// app.patch("/users/role/:id", async (req, res) => {
//   const id = req.params.id;
//   const { role } = req.body;
//   // update user role logic
//   res.send({ success: true });
// });

// // Delete user
// app.delete('/users/:id', async (req, res) => {
//   const userId = req.params.id;
//   // delete user logic, example:
//   try {
//     const result = await UsersCollection.deleteOne({ _id: new ObjectId(userId) });
//     if(result.deletedCount === 1){
//       return res.status(200).send({ message: "User deleted" });
//     } else {
//       return res.status(404).send({ message: "User not found" });
//     }
//   } catch(err) {
//     return res.status(500).send({ error: err.message });
//   }
// });


//     // ===== PROPERTIES ROUTES =====

//     app.get("/properties", async (req, res) => {
//       try {
//         const { agentEmail } = req.query;
//         const query = agentEmail ? { agentEmail } : {};

//         const properties = await propertiesCollection.find(query).toArray();
//         res.json(properties);
//       } catch (error) {
//         console.error("Error fetching properties:", error);
//         res.status(500).json({ error: "Failed to fetch properties" });
//       }
//     });

//     app.post("/properties", async (req, res) => {
//       try {
//         const property = req.body;
//         if (
//           !property.title ||
//           !property.location ||
//           !property.priceRange ||
//           !property.agentEmail
//         ) {
//           return res.status(400).json({ error: "Missing required fields" });
//         }
//         property.createdAt = new Date();

//         const result = await propertiesCollection.insertOne(property);
//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add property error:", error);
//         res.status(500).json({ error: "Failed to add property" });
//       }
//     });

//     app.get("/properties/:id", async (req, res) => {
//       const { id } = req.params;
//       if (!ObjectId.isValid(id))
//         return res.status(400).json({ error: "Invalid property ID format" });

//       try {
//         const property = await propertiesCollection.findOne({ _id: new ObjectId(id) });
//         if (!property) return res.status(404).json({ error: "Property not found" });
//         res.json(property);
//       } catch (error) {
//         console.error("Get property error:", error);
//         res.status(500).json({ error: "Failed to get property" });
//       }
//     });

//     app.delete("/properties/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id))
//         return res.status(400).json({ error: "Invalid property ID" });

//       try {
//         const result = await propertiesCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0)
//           return res.status(404).json({ error: "Property not found" });
//         res.json({ message: "Property deleted successfully" });
//       } catch (error) {
//         console.error("Delete property error:", error);
//         res.status(500).json({ error: "Internal server error" });
//       }
//     });

//     // ===== WISHLIST ROUTES =====

//     app.post("/wishlist", async (req, res) => {
//       const { userEmail, propertyId } = req.body;
//       if (!userEmail || !propertyId)
//         return res.status(400).json({ error: "Missing userEmail or propertyId" });

//       if (!ObjectId.isValid(propertyId))
//         return res.status(400).json({ error: "Invalid propertyId format" });

//       try {
//         const exists = await wishlistCollection.findOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//         });

//         if (exists) return res.status(409).json({ message: "Already in wishlist" });

//         const result = await wishlistCollection.insertOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//           createdAt: new Date(),
//         });

//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add to wishlist error:", error);
//         res.status(500).json({ error: "Failed to add to wishlist" });
//       }
//     });

//     app.get("/wishlist", async (req, res) => {
//       const { userEmail } = req.query;
//       if (!userEmail) return res.status(400).json({ error: "Missing userEmail" });

//       try {
//         const items = await wishlistCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//           ])
//           .toArray();

//         res.json(items);
//       } catch (error) {
//         console.error("Get wishlist error:", error);
//         res.status(500).json({ error: "Failed to get wishlist" });
//       }
//     });

//     app.delete("/wishlist/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id))
//         return res.status(400).json({ error: "Invalid wishlist item ID" });

//       try {
//         const result = await wishlistCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0)
//           return res.status(404).json({ error: "Wishlist item not found" });
//         res.json({ message: "Removed from wishlist" });
//       } catch (error) {
//         console.error("Delete wishlist error:", error);
//         res.status(500).json({ error: "Failed to delete from wishlist" });
//       }
//     });

//     // ===== REVIEWS ROUTES =====

//     app.get("/reviews/user/:email", async (req, res) => {
//       const email = req.params.email;
//       try {
//         const reviews = await reviewsCollection.find({ userEmail: email }).toArray();
//         if (!reviews.length)
//           return res.status(404).json({ message: "No reviews found for this user" });
//         res.json(reviews);
//       } catch (error) {
//         console.error("Error fetching user reviews:", error);
//         res.status(500).json({ error: "Failed to get user reviews" });
//       }
//     });

//     app.delete("/reviews/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id))
//         return res.status(400).json({ error: "Invalid review ID" });

//       try {
//         const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0)
//           return res.status(404).json({ message: "Review not found" });
//         res.json({ success: true, message: "Review deleted successfully" });
//       } catch (error) {
//         console.error("Delete review error:", error);
//         res.status(500).json({ error: "Failed to delete review" });
//       }
//     });

//     app.get("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       if (!ObjectId.isValid(propertyId))
//         return res.status(400).json({ error: "Invalid property ID" });

//       try {
//         // Reviews store propertyId as string for consistency
//         const reviews = await reviewsCollection.find({ propertyId }).toArray();
//         res.json(reviews);
//       } catch (error) {
//         console.error("Get reviews error:", error);
//         res.status(500).json({ error: "Failed to fetch reviews" });
//       }
//     });

//     app.post("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       const review = req.body;

//       if (!ObjectId.isValid(propertyId))
//         return res.status(400).json({ error: "Invalid property ID" });
//       if (!review.userEmail || !review.comment)
//         return res.status(400).json({ error: "Missing review fields" });

//       review.propertyId = propertyId; // store as string for consistency
//       review.createdAt = new Date();

//       try {
//         const result = await reviewsCollection.insertOne(review);
//         res.status(201).json(result);
//       } catch (error) {
//         console.error("Add review error:", error);
//         res.status(500).json({ error: "Failed to add review" });
//       }
//     });

//     app.get("/reviews/latest", async (req, res) => {
//       try {
//         const latestReviews = await reviewsCollection
//           .aggregate([
//             { $sort: { createdAt: -1 } },
//             { $limit: 3 },
//             {
//               $lookup: {
//                 from: "users",
//                 localField: "userEmail",
//                 foreignField: "email",
//                 as: "user",
//               },
//             },
//             { $unwind: "$user" },
//             {
//               $addFields: {
//                 propertyObjectId: { $toObjectId: "$propertyId" },
//               },
//             },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyObjectId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//             {
//               $project: {
//                 _id: 1,
//                 comment: 1,
//                 createdAt: 1,
//                 "user.name": 1,
//                 "user.photoURL": 1,
//                 "property.title": 1,
//               },
//             },
//           ])
//           .toArray();

//         res.json(latestReviews);
//       } catch (error) {
//         console.error("Failed to get latest reviews:", error);
//         res.status(500).json({ error: "Failed to get latest reviews" });
//       }
//     });

//     // ===== OFFERS ROUTES =====

//     app.post("/offers", async (req, res) => {
//       try {
//         const offer = req.body;
//         if (!offer.userEmail || !offer.propertyId || !offer.offerPrice)
//           return res.status(400).json({ success: false, error: "Missing required fields" });

//         offer.createdAt = new Date();

//         if (typeof offer.propertyId === "string" && ObjectId.isValid(offer.propertyId)) {
//           offer.propertyId = new ObjectId(offer.propertyId);
//         } else if (!(offer.propertyId instanceof ObjectId)) {
//           return res.status(400).json({ error: "Invalid propertyId format" });
//         }

//         const result = await offersCollection.insertOne(offer);
//         res.status(201).json({ success: true, insertedId: result.insertedId });
//       } catch (error) {
//         console.error("Add offer error:", error);
//         res.status(500).json({ success: false, error: "Failed to add offer" });
//       }
//     });

//     app.get("/offers", async (req, res) => {
//       const userEmail = req.query.email;
//       if (!userEmail) return res.status(400).json({ error: "Missing userEmail query param" });

//       try {
//         const offers = await offersCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             {
//               $addFields: {
//                 property: { $arrayElemAt: ["$property", 0] },
//               },
//             },
//             {
//               $project: {
//                 _id: 1,
//                 offerPrice: 1,
//                 createdAt: 1,
//                 status: 1,
//                 message: 1,
//                 property: {
//                   _id: 1,
//                   title: 1,
//                   location: 1,
//                   priceRange: 1,
//                   agentEmail: 1,
//                 },
//               },
//             },
//           ])
//           .toArray();

//         res.json(offers);
//       } catch (error) {
//         console.error("Get offers error:", error);
//         res.status(500).json({ error: "Failed to get offers" });
//       }
//     });

//     // DELETE OFFER

//     app.delete("/offers/:id", async (req, res) => {
//       const id = req.params.id;

//       if (!ObjectId.isValid(id)) {
//         return res.status(400).json({ error: "Invalid offer ID" });
//       }

//       try {
//         const result = await offersCollection.deleteOne({ _id: new ObjectId(id) });

//         if (result.deletedCount === 0) {
//           return res.status(404).json({ error: "Offer not found" });
//         }

//         res.json({ message: "Offer deleted successfully" });
//       } catch (error) {
//         console.error("Delete offer error:", error);
//         res.status(500).json({ error: "Internal server error" });
//       }
//     });

//     // UPDATE OFFER STATUS

//     app.patch("/offers/:id/status", async (req, res) => {
//       const offerId = req.params.id;
//       const { status } = req.body;

//       if (!["approved", "rejected"].includes(status)) {
//         return res.status(400).json({ error: "Invalid status value" });
//       }

//       if (!ObjectId.isValid(offerId)) {
//         return res.status(400).json({ error: "Invalid offer ID" });
//       }

//       try {
//         const offer = await offersCollection.findOne({ _id: new ObjectId(offerId) });

//         if (!offer) {
//           return res.status(404).json({ error: "Offer not found" });
//         }

//         // Update the selected offer status
//         await offersCollection.updateOne(
//           { _id: new ObjectId(offerId) },
//           { $set: { status } }
//         );

//         // If accepted, reject all other offers for this property
//         if (status === "approved") {
//           await offersCollection.updateMany(
//             {
//               _id: { $ne: new ObjectId(offerId) },
//               propertyId: offer.propertyId,
//             },
//             { $set: { status: "rejected" } }
//           );
//         }

//         res.json({ message: `Offer ${status}` });
//       } catch (error) {
//         console.error("Update offer status error:", error);
//         res.status(500).json({ error: "Failed to update offer status" });
//       }
//     });

//     // AGENT OFFERS ROUTE

//     app.get("/agent/offers", async (req, res) => {
//       const agentEmail = req.query.agentEmail;
//       if (!agentEmail) return res.status(400).json({ error: "Missing agentEmail query param" });

//       try {
//         // Find all properties by this agent
//         const agentProperties = await propertiesCollection
//           .find({ agentEmail })
//           .project({ _id: 1 })
//           .toArray();

//         const propertyIds = agentProperties.map((p) => p._id);

//         if (propertyIds.length === 0) return res.json([]); // no properties, no offers

//         // Find all offers on those properties
//         const offers = await offersCollection
//           .aggregate([
//             { $match: { propertyId: { $in: propertyIds } } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//             {
//               $project: {
//                 _id: 1,
//                 offerPrice: 1,
//                 createdAt: 1,
//                 userEmail: 1,
//                 status: 1,
//                 property: {
//                   _id: 1,
//                   title: 1,
//                   location: 1,
//                   priceRange: 1,
//                   agentEmail: 1,
//                 },
//               },
//             },
//           ])
//           .toArray();

//         res.json(offers);
//       } catch (error) {
//         console.error("Get agent offers error:", error);
//         res.status(500).json({ error: "Failed to get offers for agent" });
//       }
//     });

//     // ROOT ROUTE

//     app.get("/", (req, res) => {
//       res.send("🏡 Real Estate Server is Running with Wishlist, Role & Offers System!");
//     });

//     // START SERVER
//     app.listen(port, () => {
//       console.log(`🚀 Server running on port ${port}`);
//     });

//     // Graceful shutdown
//     process.on("SIGINT", async () => {
//       await client.close();
//       console.log("MongoDB connection closed");
//       process.exit(0);
//     });
//   } catch (err) {
//     console.error("❌ MongoDB connection failed:", err);
//   }
// }

// run();



// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// dotenv.config();

// const app = express();
// const port = process.env.PORT || 5000;

// // Middleware
// app.use(
//   cors({
//     origin: "http://localhost:5173", // frontend URL
//     credentials: true,
//   })
// );
// app.use(express.json());

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djvkmk5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// async function run() {
//   try {
//     await client.connect();
//     console.log("✅ Connected to MongoDB");

//     const db = client.db("realestate");
//     const usersCollection = db.collection("users");
//     const propertiesCollection = db.collection("properties");
//     const reviewsCollection = db.collection("reviews");
//     const wishlistCollection = db.collection("wishlists");
//     const offersCollection = db.collection("offers");

//     // ===== USER ROUTES =====

//     app.post("/users", async (req, res) => {
//       try {
//         const user = req.body;
//         if (!user.email)
//           return res.status(400).send({ error: "Email is required" });

//         const existingUser = await usersCollection.findOne({ email: user.email });

//         const roleToSet = user.role || (existingUser ? existingUser.role : "user");
//         const updateData = {
//           name: user.name || (existingUser ? existingUser.name : ""),
//           email: user.email,
//           photoURL: user.photoURL || (existingUser ? existingUser.photoURL : ""),
//           role: roleToSet,
//         };

//         const result = await usersCollection.updateOne(
//           { email: user.email },
//           { $set: updateData },
//           { upsert: true }
//         );

//         res.send({ message: "User saved/updated", role: roleToSet, result });
//       } catch (error) {
//         console.error("Add/update user error:", error);
//         res.status(500).send({ error: "Failed to add/update user" });
//       }
//     });

//     app.get("/users/:email", async (req, res) => {
//       try {
//         const email = req.params.email;
//         const user = await usersCollection.findOne({ email });
//         if (!user) return res.send({ role: "user" });
//         res.send({ role: user.role });
//       } catch (error) {
//         console.error("Get user role error:", error);
//         res.status(500).send({ error: "Failed to get user role" });
//       }
//     });

//     app.patch("/users/role/:id", async (req, res) => {
//       try {
//         const id = req.params.id;
//         const { role } = req.body;
//         if (!role) return res.status(400).send({ error: "Role is required" });
//         if (!ObjectId.isValid(id)) return res.status(400).send({ error: "Invalid user ID" });

//         const result = await usersCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { role } }
//         );
//         res.send(result);
//       } catch (error) {
//         console.error("Set user role error:", error);
//         res.status(500).send({ error: "Failed to update user role" });
//       }
//     });

//     // ===== PROPERTIES ROUTES =====

//     app.get("/properties", async (req, res) => {
//       const { agentEmail } = req.query;
//       const query = agentEmail ? { agentEmail } : {};
//       try {
//         const properties = await propertiesCollection.find(query).toArray();
//         res.send(properties);
//       } catch (error) {
//         console.error("Error fetching properties:", error);
//         res.status(500).send({ error: "Failed to fetch properties" });
//       }
//     });

//     app.post("/properties", async (req, res) => {
//       try {
//         const property = req.body;
//         if (
//           !property.title ||
//           !property.location ||
//           !property.priceRange ||
//           !property.agentEmail
//         ) {
//           return res.status(400).send({ error: "Missing required fields" });
//         }
//         property.createdAt = new Date();

//         const result = await propertiesCollection.insertOne(property);
//         res.status(201).send(result);
//       } catch (error) {
//         console.error("Add property error:", error);
//         res.status(500).send({ error: "Failed to add property" });
//       }
//     });

//     app.get("/properties/:id", async (req, res) => {
//       const { id } = req.params;
//       if (!ObjectId.isValid(id))
//         return res.status(400).send({ error: "Invalid property ID format" });

//       try {
//         const property = await propertiesCollection.findOne({ _id: new ObjectId(id) });
//         if (!property) return res.status(404).send({ error: "Property not found" });
//         res.send(property);
//       } catch (error) {
//         console.error("Get property error:", error);
//         res.status(500).send({ error: "Failed to get property" });
//       }
//     });

//     app.delete("/properties/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).send({ error: "Invalid property ID" });

//       try {
//         const result = await propertiesCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0)
//           return res.status(404).send({ error: "Property not found" });
//         res.send({ message: "Property deleted successfully" });
//       } catch (error) {
//         console.error("Delete property error:", error);
//         res.status(500).send({ error: "Internal server error" });
//       }
//     });

//     // ===== WISHLIST ROUTES =====

//     app.post("/wishlist", async (req, res) => {
//       const { userEmail, propertyId } = req.body;
//       if (!userEmail || !propertyId)
//         return res.status(400).send({ error: "Missing userEmail or propertyId" });

//       if (!ObjectId.isValid(propertyId))
//         return res.status(400).send({ error: "Invalid propertyId format" });

//       try {
//         const exists = await wishlistCollection.findOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//         });

//         if (exists) return res.status(409).send({ message: "Already in wishlist" });

//         const result = await wishlistCollection.insertOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//           createdAt: new Date(),
//         });

//         res.status(201).send(result);
//       } catch (error) {
//         console.error("Add to wishlist error:", error);
//         res.status(500).send({ error: "Failed to add to wishlist" });
//       }
//     });

//     app.get("/wishlist", async (req, res) => {
//       const { userEmail } = req.query;
//       if (!userEmail) return res.status(400).send({ error: "Missing userEmail" });

//       try {
//         const items = await wishlistCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//           ])
//           .toArray();

//         res.send(items);
//       } catch (error) {
//         console.error("Get wishlist error:", error);
//         res.status(500).send({ error: "Failed to get wishlist" });
//       }
//     });

//     app.delete("/wishlist/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).send({ error: "Invalid wishlist item ID" });

//       try {
//         const result = await wishlistCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0)
//           return res.status(404).send({ error: "Wishlist item not found" });
//         res.send({ message: "Removed from wishlist" });
//       } catch (error) {
//         console.error("Delete wishlist error:", error);
//         res.status(500).send({ error: "Failed to delete from wishlist" });
//       }
//     });

//     // ===== REVIEWS ROUTES =====

//     app.get("/reviews/user/:email", async (req, res) => {
//       const email = req.params.email;
//       try {
//         const reviews = await reviewsCollection.find({ userEmail: email }).toArray();
//         if (!reviews.length)
//           return res.status(404).send({ message: "No reviews found for this user" });
//         res.send(reviews);
//       } catch (error) {
//         console.error("Error fetching user reviews:", error);
//         res.status(500).send({ error: "Failed to get user reviews" });
//       }
//     });

//     app.delete("/reviews/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).send({ error: "Invalid review ID" });

//       try {
//         const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0)
//           return res.status(404).send({ message: "Review not found" });
//         res.send({ success: true, message: "Review deleted successfully" });
//       } catch (error) {
//         console.error("Delete review error:", error);
//         res.status(500).send({ error: "Failed to delete review" });
//       }
//     });

//     app.get("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       if (!ObjectId.isValid(propertyId))
//         return res.status(400).send({ error: "Invalid property ID" });

//       try {
//         // Reviews store propertyId as string for consistency
//         const reviews = await reviewsCollection.find({ propertyId }).toArray();
//         res.send(reviews);
//       } catch (error) {
//         console.error("Get reviews error:", error);
//         res.status(500).send({ error: "Failed to fetch reviews" });
//       }
//     });

//     app.post("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       const review = req.body;

//       if (!ObjectId.isValid(propertyId))
//         return res.status(400).send({ error: "Invalid property ID" });
//       if (!review.userEmail || !review.comment)
//         return res.status(400).send({ error: "Missing review fields" });

//       review.propertyId = propertyId; // store as string for consistency
//       review.createdAt = new Date();

//       try {
//         const result = await reviewsCollection.insertOne(review);
//         res.status(201).send(result);
//       } catch (error) {
//         console.error("Add review error:", error);
//         res.status(500).send({ error: "Failed to add review" });
//       }
//     });

//     app.get("/reviews/latest", async (req, res) => {
//       try {
//         const latestReviews = await reviewsCollection
//           .aggregate([
//             { $sort: { createdAt: -1 } },
//             { $limit: 3 },
//             {
//               $lookup: {
//                 from: "users",
//                 localField: "userEmail",
//                 foreignField: "email",
//                 as: "user",
//               },
//             },
//             { $unwind: "$user" },
//             {
//               $addFields: {
//                 propertyObjectId: { $toObjectId: "$propertyId" },
//               },
//             },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyObjectId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//             {
//               $project: {
//                 _id: 1,
//                 comment: 1,
//                 createdAt: 1,
//                 "user.name": 1,
//                 "user.photoURL": 1,
//                 "property.title": 1,
//               },
//             },
//           ])
//           .toArray();

//         res.send(latestReviews);
//       } catch (error) {
//         console.error("Failed to get latest reviews:", error);
//         res.status(500).send({ error: "Failed to get latest reviews" });
//       }
//     });




//     // ===== OFFERS ROUTES =====

//     app.post("/offers", async (req, res) => {
//       try {
//         const offer = req.body;
//         if (!offer.userEmail || !offer.propertyId || !offer.offerPrice)
//           return res.status(400).send({ success: false, error: "Missing required fields" });

//         offer.createdAt = new Date();

//         if (typeof offer.propertyId === "string" && ObjectId.isValid(offer.propertyId)) {
//           offer.propertyId = new ObjectId(offer.propertyId);
//         } else if (!(offer.propertyId instanceof ObjectId)) {
//           return res.status(400).send({ error: "Invalid propertyId format" });
//         }

//         const result = await offersCollection.insertOne(offer);
//         res.status(201).send({ success: true, insertedId: result.insertedId });
//       } catch (error) {
//         console.error("Add offer error:", error);
//         res.status(500).send({ success: false, error: "Failed to add offer" });
//       }
//     });

//     app.get("/offers", async (req, res) => {
//       const userEmail = req.query.email;
//       if (!userEmail) return res.status(400).send({ error: "Missing userEmail query param" });

//       try {
//         const offers = await offersCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             {
//               $addFields: {
//                 property: { $arrayElemAt: ["$property", 0] },
//               },
//             },
//             {
//               $project: {
//                 _id: 1,
//                 offerPrice: 1,
//                 createdAt: 1,
//                 status: 1,
//                 message: 1,
//                 property: {
//                   _id: 1,
//                   title: 1,
//                   location: 1,
//                   priceRange: 1,
//                   agentEmail: 1,
//                 },
//               },
//             },
//           ])
//           .toArray();

//         res.send(offers);
//       } catch (error) {
//         console.error("Get offers error:", error);
//         res.status(500).send({ error: "Failed to get offers" });
//       }
//     });

//     // ===== DELETE OFFER ROUTE - FIX FOR YOUR ERROR =====

//     app.delete("/offers/:id", async (req, res) => {
//       const id = req.params.id;

//       if (!ObjectId.isValid(id)) {
//         return res.status(400).json({ error: "Invalid offer ID" });
//       }

//       try {
//         const result = await offersCollection.deleteOne({ _id: new ObjectId(id) });

//         if (result.deletedCount === 0) {
//           return res.status(404).json({ error: "Offer not found" });
//         }

//         res.json({ message: "Offer deleted successfully" });
//       } catch (error) {
//         console.error("Delete offer error:", error);
//         res.status(500).json({ error: "Internal server error" });
//       }
//     });



//     app.patch("/offers/:id/status", async (req, res) => {
//   const offerId = req.params.id;
//   const { status } = req.body;

//   if (!["approved", "rejected"].includes(status)) {
//     return res.status(400).json({ error: "Invalid status value" });
//   }

//   if (!ObjectId.isValid(offerId)) {
//     return res.status(400).json({ error: "Invalid offer ID" });
//   }

//   try {
//     const offer = await offersCollection.findOne({ _id: new ObjectId(offerId) });

//     if (!offer) {
//       return res.status(404).json({ error: "Offer not found" });
//     }

//     // Update the selected offer status
//     await offersCollection.updateOne(
//       { _id: new ObjectId(offerId) },
//       { $set: { status } }
//     );

//     // If accepted, reject all other offers for this property
//     if (status === "approved") {
//       await offersCollection.updateMany(
//         {
//           _id: { $ne: new ObjectId(offerId) },
//           propertyId: offer.propertyId,
//         },
//         { $set: { status: "rejected" } }
//       );
//     }

//     res.json({ message: `Offer ${status}` });
//   } catch (error) {
//     console.error("Update offer status error:", error);
//     res.status(500).json({ error: "Failed to update offer status" });
//   }
// });





//     // ===== AGENT OFFERS ROUTE =====

//     app.get("/agent/offers", async (req, res) => {
//       const agentEmail = req.query.agentEmail;
//       if (!agentEmail) return res.status(400).send({ error: "Missing agentEmail query param" });

//       try {
//         // First find all properties by this agent
//         const agentProperties = await propertiesCollection.find({ agentEmail }).project({ _id: 1 }).toArray();
//         const propertyIds = agentProperties.map((p) => p._id);

//         if (propertyIds.length === 0) return res.send([]); // no properties, no offers

//         // Find all offers on those properties
//         const offers = await offersCollection
//           .aggregate([
//             { $match: { propertyId: { $in: propertyIds } } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//             {
//               $project: {
//                 _id: 1,
//                 offerPrice: 1,
//                 createdAt: 1,
//                 userEmail: 1,
//                 property: {
//                   _id: 1,
//                   title: 1,
//                   location: 1,
//                   priceRange: 1,
//                   agentEmail: 1,
//                 },
//               },
//             },
//           ])
//           .toArray();

//         res.send(offers);
//       } catch (error) {
//         console.error("Get agent offers error:", error);
//         res.status(500).send({ error: "Failed to get offers for agent" });
//       }
//     });

//     // ===== ROOT ROUTE =====

//     app.get("/", (req, res) => {
//       res.send("🏡 Real Estate Server is Running with Wishlist, Role & Offers System!");
//     });

//     // ===== START SERVER =====

//     app.listen(port, () => {
//       console.log(`🚀 Server running on port ${port}`);
//     });

//     // Graceful shutdown
//     process.on("SIGINT", async () => {
//       await client.close();
//       console.log("MongoDB connection closed");
//       process.exit(0);
//     });
//   } catch (err) {
//     console.error("❌ MongoDB connection failed:", err);
//   }
// }

// run();


// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// dotenv.config();

// const app = express();
// const port = process.env.PORT || 5000;

// // Middleware
// app.use(
//   cors({
//     origin: "http://localhost:5173", // frontend URL
//     credentials: true,
//   })
// );
// app.use(express.json());

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djvkmk5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// async function run() {
//   try {
//     await client.connect();
//     console.log("✅ Connected to MongoDB");

//     const db = client.db("realestate");
//     const usersCollection = db.collection("users");
//     const propertiesCollection = db.collection("properties");
//     const reviewsCollection = db.collection("reviews");
//     const wishlistCollection = db.collection("wishlists");
//     const offersCollection = db.collection("offers");

//     // ===== USER ROUTES =====

//     app.post("/users", async (req, res) => {
//       try {
//         const user = req.body;
//         if (!user.email) return res.status(400).send({ error: "Email is required" });

//         const existingUser = await usersCollection.findOne({ email: user.email });

//         const roleToSet = user.role || (existingUser ? existingUser.role : "user");
//         const updateData = {
//           name: user.name || (existingUser ? existingUser.name : ""),
//           email: user.email,
//           photoURL: user.photoURL || (existingUser ? existingUser.photoURL : ""),
//           role: roleToSet,
//         };

//         const result = await usersCollection.updateOne(
//           { email: user.email },
//           { $set: updateData },
//           { upsert: true }
//         );

//         res.send({ message: "User saved/updated", role: roleToSet, result });
//       } catch (error) {
//         console.error("Add/update user error:", error);
//         res.status(500).send({ error: "Failed to add/update user" });
//       }
//     });

//     app.get("/users/:email", async (req, res) => {
//       try {
//         const email = req.params.email;
//         const user = await usersCollection.findOne({ email });
//         if (!user) return res.send({ role: "user" });
//         res.send({ role: user.role });
//       } catch (error) {
//         console.error("Get user role error:", error);
//         res.status(500).send({ error: "Failed to get user role" });
//       }
//     });

//     app.patch("/users/role/:id", async (req, res) => {
//       try {
//         const id = req.params.id;
//         const { role } = req.body;
//         if (!role) return res.status(400).send({ error: "Role is required" });
//         if (!ObjectId.isValid(id)) return res.status(400).send({ error: "Invalid user ID" });

//         const result = await usersCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { role } }
//         );
//         res.send(result);
//       } catch (error) {
//         console.error("Set user role error:", error);
//         res.status(500).send({ error: "Failed to update user role" });
//       }
//     });

//     // ===== PROPERTIES ROUTES =====

//     app.get("/properties", async (req, res) => {
//       const { agentEmail } = req.query;
//       const query = agentEmail ? { agentEmail } : {};
//       try {
//         const properties = await propertiesCollection.find(query).toArray();
//         res.send(properties);
//       } catch (error) {
//         console.error("Error fetching properties:", error);
//         res.status(500).send({ error: "Failed to fetch properties" });
//       }
//     });

//     app.post("/properties", async (req, res) => {
//       try {
//         const property = req.body;
//         if (
//           !property.title ||
//           !property.location ||
//           !property.priceRange ||
//           !property.agentEmail
//         ) {
//           return res.status(400).send({ error: "Missing required fields" });
//         }
//         property.createdAt = new Date();

//         const result = await propertiesCollection.insertOne(property);
//         res.status(201).send(result);
//       } catch (error) {
//         console.error("Add property error:", error);
//         res.status(500).send({ error: "Failed to add property" });
//       }
//     });

//     app.get("/properties/:id", async (req, res) => {
//       const { id } = req.params;
//       if (!ObjectId.isValid(id)) return res.status(400).send({ error: "Invalid property ID format" });

//       try {
//         const property = await propertiesCollection.findOne({ _id: new ObjectId(id) });
//         if (!property) return res.status(404).send({ error: "Property not found" });
//         res.send(property);
//       } catch (error) {
//         console.error("Get property error:", error);
//         res.status(500).send({ error: "Failed to get property" });
//       }
//     });

//     app.delete("/properties/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).send({ error: "Invalid property ID" });

//       try {
//         const result = await propertiesCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).send({ error: "Property not found" });
//         res.send({ message: "Property deleted successfully" });
//       } catch (error) {
//         console.error("Delete property error:", error);
//         res.status(500).send({ error: "Internal server error" });
//       }
//     });

//     // ===== WISHLIST ROUTES =====

//     app.post("/wishlist", async (req, res) => {
//       const { userEmail, propertyId } = req.body;
//       if (!userEmail || !propertyId)
//         return res.status(400).send({ error: "Missing userEmail or propertyId" });

//       if (!ObjectId.isValid(propertyId))
//         return res.status(400).send({ error: "Invalid propertyId format" });

//       try {
//         const exists = await wishlistCollection.findOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//         });

//         if (exists) return res.status(409).send({ message: "Already in wishlist" });

//         const result = await wishlistCollection.insertOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//           createdAt: new Date(),
//         });

//         res.status(201).send(result);
//       } catch (error) {
//         console.error("Add to wishlist error:", error);
//         res.status(500).send({ error: "Failed to add to wishlist" });
//       }
//     });

//     app.get("/wishlist", async (req, res) => {
//       const { userEmail } = req.query;
//       if (!userEmail) return res.status(400).send({ error: "Missing userEmail" });

//       try {
//         const items = await wishlistCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//           ])
//           .toArray();

//         res.send(items);
//       } catch (error) {
//         console.error("Get wishlist error:", error);
//         res.status(500).send({ error: "Failed to get wishlist" });
//       }
//     });

//     app.delete("/wishlist/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).send({ error: "Invalid wishlist item ID" });

//       try {
//         const result = await wishlistCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).send({ error: "Wishlist item not found" });
//         res.send({ message: "Removed from wishlist" });
//       } catch (error) {
//         console.error("Delete wishlist error:", error);
//         res.status(500).send({ error: "Failed to delete from wishlist" });
//       }
//     });

//     // ===== REVIEWS ROUTES =====

//     app.get("/reviews/user/:email", async (req, res) => {
//       const email = req.params.email;
//       try {
//         const reviews = await reviewsCollection.find({ userEmail: email }).toArray();
//         if (!reviews.length) return res.status(404).send({ message: "No reviews found for this user" });
//         res.send(reviews);
//       } catch (error) {
//         console.error("Error fetching user reviews:", error);
//         res.status(500).send({ error: "Failed to get user reviews" });
//       }
//     });

//     app.delete("/reviews/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).send({ error: "Invalid review ID" });

//       try {
//         const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).send({ message: "Review not found" });
//         res.send({ success: true, message: "Review deleted successfully" });
//       } catch (error) {
//         console.error("Delete review error:", error);
//         res.status(500).send({ error: "Failed to delete review" });
//       }
//     });

//     app.get("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       if (!ObjectId.isValid(propertyId)) return res.status(400).send({ error: "Invalid property ID" });

//       try {
//         // Reviews store propertyId as string for consistency
//         const reviews = await reviewsCollection.find({ propertyId }).toArray();
//         res.send(reviews);
//       } catch (error) {
//         console.error("Get reviews error:", error);
//         res.status(500).send({ error: "Failed to fetch reviews" });
//       }
//     });

//     app.post("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       const review = req.body;

//       if (!ObjectId.isValid(propertyId)) return res.status(400).send({ error: "Invalid property ID" });
//       if (!review.userEmail || !review.comment) return res.status(400).send({ error: "Missing review fields" });

//       review.propertyId = propertyId; // store as string for consistency
//       review.createdAt = new Date();

//       try {
//         const result = await reviewsCollection.insertOne(review);
//         res.status(201).send(result);
//       } catch (error) {
//         console.error("Add review error:", error);
//         res.status(500).send({ error: "Failed to add review" });
//       }
//     });

//     app.get("/reviews/latest", async (req, res) => {
//       try {
//         const latestReviews = await reviewsCollection
//           .aggregate([
//             { $sort: { createdAt: -1 } },
//             { $limit: 3 },
//             {
//               $lookup: {
//                 from: "users",
//                 localField: "userEmail",
//                 foreignField: "email",
//                 as: "user",
//               },
//             },
//             { $unwind: "$user" },
//             {
//               $addFields: {
//                 propertyObjectId: { $toObjectId: "$propertyId" },
//               },
//             },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyObjectId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//             {
//               $project: {
//                 _id: 1,
//                 comment: 1,
//                 createdAt: 1,
//                 "user.name": 1,
//                 "user.photoURL": 1,
//                 "property.title": 1,
//               },
//             },
//           ])
//           .toArray();

//         res.send(latestReviews);
//       } catch (error) {
//         console.error("Failed to get latest reviews:", error);
//         res.status(500).send({ error: "Failed to get latest reviews" });
//       }
//     });

//     // ===== OFFERS ROUTES =====

//     app.post("/offers", async (req, res) => {
//       try {
//         const offer = req.body;
//         if (!offer.userEmail || !offer.propertyId || !offer.offerPrice)
//           return res.status(400).send({ success: false, error: "Missing required fields" });

//         offer.createdAt = new Date();

//         if (typeof offer.propertyId === "string" && ObjectId.isValid(offer.propertyId)) {
//           offer.propertyId = new ObjectId(offer.propertyId);
//         } else if (!(offer.propertyId instanceof ObjectId)) {
//           return res.status(400).send({ error: "Invalid propertyId format" });
//         }

//         const result = await offersCollection.insertOne(offer);
//         res.status(201).send({ success: true, insertedId: result.insertedId });
//       } catch (error) {
//         console.error("Add offer error:", error);
//         res.status(500).send({ success: false, error: "Failed to add offer" });
//       }
//     });

//     app.get("/offers", async (req, res) => {
//       const userEmail = req.query.email;
//       if (!userEmail) return res.status(400).send({ error: "Missing userEmail query param" });

//       try {
//         const offers = await offersCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//             {
//               $project: {
//                 _id: 1,
//                 offerPrice: 1,
//                 createdAt: 1,
//                 property: {
//                   _id: 1,
//                   title: 1,
//                   location: 1,
//                   priceRange: 1,
//                   agentEmail: 1,
//                 },
//               },
//             },
//           ])
//           .toArray();

//         res.send(offers);
//       } catch (error) {
//         console.error("Get offers error:", error);
//         res.status(500).send({ error: "Failed to get offers" });
//       }
//     });

//     // ===== ROOT ROUTE =====

//     app.get("/", (req, res) => {
//       res.send("🏡 Real Estate Server is Running with Wishlist, Role & Offers System!");
//     });

//     // ===== START SERVER =====

//     app.listen(port, () => {
//       console.log(`🚀 Server running on port ${port}`);
//     });

//     // Graceful shutdown
//     process.on("SIGINT", async () => {
//       await client.close();
//       console.log("MongoDB connection closed");
//       process.exit(0);
//     });
//   } catch (err) {
//     console.error("❌ MongoDB connection failed:", err);
//   }
// }

// run();

// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// dotenv.config();

// const app = express();
// const port = process.env.PORT || 5000;

// app.use(
//   cors({
//     origin: "http://localhost:5173", // tumar frontend er URL
//     credentials: true,
//   })
// );

// app.use(express.json());

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djvkmk5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// async function run() {
//   try {
//     await client.connect();
//     console.log("✅ Connected to MongoDB");

//     const db = client.db("realestate");
//     const usersCollection = db.collection("users");
//     const propertiesCollection = db.collection("properties");
//     const reviewsCollection = db.collection("reviews");
//     const wishlistCollection = db.collection("wishlists");
//     const offersCollection = db.collection("offers"); // Added offers collection

//     // =========================
//     // USER ROUTES
//     // =========================

//     app.post("/users", async (req, res) => {
//       try {
//         const user = req.body;
//         if (!user.email) {
//           return res.status(400).send({ error: "Email is required" });
//         }
//         const existingUser = await usersCollection.findOne({ email: user.email });
//         const roleToSet = user.role || (existingUser ? existingUser.role : "user");
//         const updateData = {
//           name: user.name || (existingUser ? existingUser.name : ""),
//           email: user.email,
//           photoURL: user.photoURL || (existingUser ? existingUser.photoURL : ""),
//           role: roleToSet,
//         };
//         const result = await usersCollection.updateOne(
//           { email: user.email },
//           { $set: updateData },
//           { upsert: true }
//         );
//         res.send({ message: "User saved/updated", role: roleToSet, result });
//       } catch (error) {
//         console.error("Add/update user error:", error);
//         res.status(500).send({ error: "Failed to add/update user" });
//       }
//     });

//     app.get("/users/:email", async (req, res) => {
//       try {
//         const email = req.params.email;
//         const user = await usersCollection.findOne({ email });
//         if (!user) return res.send({ role: "user" });
//         res.send({ role: user.role });
//       } catch (error) {
//         console.error("Get user role error:", error);
//         res.status(500).send({ error: "Failed to get user role" });
//       }
//     });

//     app.patch("/users/role/:id", async (req, res) => {
//       try {
//         const id = req.params.id;
//         const { role } = req.body;
//         if (!role) return res.status(400).send({ error: "Role is required" });
//         if (!ObjectId.isValid(id)) return res.status(400).send({ error: "Invalid user ID" });
//         const result = await usersCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { role } }
//         );
//         res.send(result);
//       } catch (error) {
//         console.error("Set user role error:", error);
//         res.status(500).send({ error: "Failed to update user role" });
//       }
//     });

//     // =========================
//     // PROPERTIES ROUTES
//     // =========================

//     app.get("/properties", async (req, res) => {
//       const { agentEmail } = req.query;
//       const query = agentEmail ? { agentEmail } : {};
//       try {
//         const properties = await propertiesCollection.find(query).toArray();
//         res.send(properties);
//       } catch (error) {
//         console.error("Error fetching properties:", error);
//         res.status(500).send({ error: "Failed to fetch properties" });
//       }
//     });

//     app.post("/properties", async (req, res) => {
//       try {
//         const property = req.body;
//         if (
//           !property.title ||
//           !property.location ||
//           !property.priceRange ||
//           !property.agentEmail
//         ) {
//           return res.status(400).send({ error: "Missing required fields" });
//         }
//         const result = await propertiesCollection.insertOne(property);
//         res.send(result);
//       } catch (error) {
//         console.error("Add property error:", error);
//         res.status(500).send({ error: "Failed to add property" });
//       }
//     });

//     app.get("/properties/:id", async (req, res) => {
//       const { id } = req.params;
//       if (!ObjectId.isValid(id)) {
//         return res.status(400).send({ error: "Invalid property ID" });
//       }
//       try {
//         const property = await propertiesCollection.findOne({ _id: new ObjectId(id) });
//         if (!property) return res.status(404).send({ error: "Property not found" });
//         res.send(property);
//       } catch (error) {
//         console.error("Get property error:", error);
//         res.status(500).send({ error: "Failed to get property" });
//       }
//     });

//     app.delete("/properties/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) {
//         return res.status(400).send({ error: "Invalid property ID" });
//       }
//       try {
//         const result = await propertiesCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) {
//           return res.status(404).send({ error: "Property not found" });
//         }
//         res.send({ message: "Property deleted successfully" });
//       } catch (error) {
//         console.error("Delete property error:", error);
//         res.status(500).send({ error: "Internal server error" });
//       }
//     });

//     // =========================
//     // WISHLIST ROUTES
//     // =========================

//     app.post("/wishlist", async (req, res) => {
//       const { userEmail, propertyId } = req.body;
//       if (!userEmail || !propertyId) {
//         return res.status(400).send({ error: "Missing userEmail or propertyId" });
//       }
//       if (!ObjectId.isValid(propertyId)) {
//         return res.status(400).send({ error: "Invalid propertyId format" });
//       }
//       try {
//         const exists = await wishlistCollection.findOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//         });
//         if (exists) {
//           return res.status(409).send({ message: "Already in wishlist" });
//         }
//         const result = await wishlistCollection.insertOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//           createdAt: new Date(),
//         });
//         res.send(result);
//       } catch (error) {
//         console.error("Add to wishlist error:", error);
//         res.status(500).send({ error: "Failed to add to wishlist" });
//       }
//     });

//     app.get("/wishlist", async (req, res) => {
//       const { userEmail } = req.query;
//       if (!userEmail) {
//         return res.status(400).send({ error: "Missing userEmail" });
//       }
//       try {
//         const items = await wishlistCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//           ])
//           .toArray();
//         res.send(items);
//       } catch (error) {
//         console.error("Get wishlist error:", error);
//         res.status(500).send({ error: "Failed to get wishlist" });
//       }
//     });

//     app.delete("/wishlist/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) {
//         return res.status(400).send({ error: "Invalid wishlist item ID" });
//       }
//       try {
//         const result = await wishlistCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) {
//           return res.status(404).send({ error: "Wishlist item not found" });
//         }
//         res.send({ message: "Removed from wishlist" });
//       } catch (error) {
//         console.error("Delete wishlist error:", error);
//         res.status(500).send({ error: "Failed to delete from wishlist" });
//       }
//     });

//     // =========================
//     // REVIEWS ROUTES
//     // =========================

//     app.get("/reviews/user/:email", async (req, res) => {
//       const email = req.params.email;
//       try {
//         const reviews = await reviewsCollection.find({ userEmail: email }).toArray();
//         if (!reviews.length) {
//           return res.status(404).send({ message: "No reviews found for this user" });
//         }
//         res.send(reviews);
//       } catch (error) {
//         console.error("Error fetching user reviews:", error);
//         res.status(500).send({ error: "Failed to get user reviews" });
//       }
//     });

//     app.delete("/reviews/:id", async (req, res) => {
//       const id = req.params.id;
//       try {
//         const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) {
//           return res.status(404).send({ message: "Review not found" });
//         }
//         res.send({ success: true, message: "Review deleted successfully" });
//       } catch (error) {
//         console.error("Delete review error:", error);
//         res.status(500).send({ error: "Failed to delete review" });
//       }
//     });

//     app.get("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       if (!ObjectId.isValid(propertyId)) {
//         return res.status(400).send({ error: "Invalid property ID" });
//       }
//       try {
//         // Reviews store propertyId as string for consistency
//         const reviews = await reviewsCollection.find({ propertyId }).toArray();
//         res.send(reviews);
//       } catch (error) {
//         console.error("Get reviews error:", error);
//         res.status(500).send({ error: "Failed to fetch reviews" });
//       }
//     });

//     app.post("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       const review = req.body;
//       if (!ObjectId.isValid(propertyId)) {
//         return res.status(400).send({ error: "Invalid property ID" });
//       }
//       if (!review.userEmail || !review.comment) {
//         return res.status(400).send({ error: "Missing review fields" });
//       }
//       review.propertyId = propertyId; // store as string
//       review.createdAt = new Date();
//       try {
//         const result = await reviewsCollection.insertOne(review);
//         res.send(result);
//       } catch (error) {
//         console.error("Add review error:", error);
//         res.status(500).send({ error: "Failed to add review" });
//       }
//     });

//     app.get("/reviews/latest", async (req, res) => {
//       try {
//         const latestReviews = await reviewsCollection
//           .aggregate([
//             { $sort: { createdAt: -1 } },
//             { $limit: 3 },
//             {
//               $lookup: {
//                 from: "users",
//                 localField: "userEmail",
//                 foreignField: "email",
//                 as: "user",
//               },
//             },
//             { $unwind: "$user" },
//             {
//               $addFields: {
//                 propertyObjectId: { $toObjectId: "$propertyId" },
//               },
//             },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyObjectId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//             {
//               $project: {
//                 _id: 1,
//                 comment: 1,
//                 createdAt: 1,
//                 "user.name": 1,
//                 "user.photoURL": 1,
//                 "property.title": 1,
//               },
//             },
//           ])
//           .toArray();
//         res.send(latestReviews);
//       } catch (error) {
//         console.error("Failed to get latest reviews:", error);
//         res.status(500).send({ error: "Failed to get latest reviews" });
//       }
//     });

//     // =========================
//     // OFFERS ROUTES (Added)
//     // =========================

//     // Add a new offer
//     app.post("/offers", async (req, res) => {
//       try {
//         const offer = req.body;
//         if (!offer.userEmail || !offer.propertyId || !offer.offerPrice) {
//           return res.status(400).send({ success: false, error: "Missing required fields" });
//         }
//         offer.createdAt = new Date();

//         // Ensure propertyId is ObjectId
//         if (typeof offer.propertyId === "string" && ObjectId.isValid(offer.propertyId)) {
//           offer.propertyId = new ObjectId(offer.propertyId);
//         } else if (!(offer.propertyId instanceof ObjectId)) {
//           return res.status(400).send({ error: "Invalid propertyId format" });
//         }

//         const result = await offersCollection.insertOne(offer);
//         res.status(201).send({ success: true, insertedId: result.insertedId });
//       } catch (error) {
//         console.error("Add offer error:", error);
//         res.status(500).send({ success: false, error: "Failed to add offer" });
//       }
//     });

//     // Get offers by user email with property details joined
//     app.get("/offers", async (req, res) => {
//       const userEmail = req.query.email;
//       if (!userEmail) {
//         return res.status(400).send({ error: "Missing userEmail query param" });
//       }
//       try {
//         const offers = await offersCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//             {
//               $project: {
//                 _id: 1,
//                 offerPrice: 1,
//                 createdAt: 1,
//                 property: {
//                   _id: 1,
//                   title: 1,
//                   location: 1,
//                   priceRange: 1,
//                   agentEmail: 1,
//                 },
//               },
//             },
//           ])
//           .toArray();
//         res.send(offers);
//       } catch (error) {
//         console.error("Get offers error:", error);
//         res.status(500).send({ error: "Failed to get offers" });
//       }
//     });

//     // =========================
//     // ROOT ROUTE
//     // =========================

//     app.get("/", (req, res) => {
//       res.send("🏡 Real Estate Server is Running with Wishlist, Role & Offers System!");
//     });

//     // =========================
//     // START SERVER
//     // =========================

//     app.listen(port, () => {
//       console.log(`🚀 Server running on port ${port}`);
//     });
//   } catch (err) {
//     console.error("❌ MongoDB connection failed:", err);
//   }
// }

// run();



// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// dotenv.config();

// const app = express();
// const port = process.env.PORT || 5000;

// app.use(
//   cors({
//     origin: "http://localhost:5173", // tumar frontend er URL
//     credentials: true,
//   })
// );

// app.use(express.json());

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djvkmk5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// async function run() {
//   try {
//     await client.connect();
//     console.log("✅ Connected to MongoDB");

//     const db = client.db("realestate");
//     const usersCollection = db.collection("users");
//     const propertiesCollection = db.collection("properties");
//     const reviewsCollection = db.collection("reviews");
//     const wishlistCollection = db.collection("wishlists");

//     // =========================
//     // USER ROUTES
//     // =========================

//     // Add or update user (with role)
//     app.post("/users", async (req, res) => {
//       try {
//         const user = req.body;
//         console.log("POST /users body:", user);

//         if (!user.email) {
//           return res.status(400).send({ error: "Email is required" });
//         }

//         const existingUser = await usersCollection.findOne({ email: user.email });

//         // Role priority: frontend sent role > existing user role > default 'user'
//         const roleToSet = user.role || (existingUser ? existingUser.role : "user");
//         console.log("Role to set:", roleToSet);

//         const updateData = {
//           name: user.name || (existingUser ? existingUser.name : ""),
//           email: user.email,
//           photoURL: user.photoURL || (existingUser ? existingUser.photoURL : ""),
//           role: roleToSet,
//         };

//         const result = await usersCollection.updateOne(
//           { email: user.email },
//           { $set: updateData },
//           { upsert: true }
//         );

//         console.log("MongoDB update result:", result);

//         res.send({ message: "User saved/updated", role: roleToSet, result });
//       } catch (error) {
//         console.error("Add/update user error:", error);
//         res.status(500).send({ error: "Failed to add/update user" });
//       }
//     });

//     // Get user role by email
//     app.get("/users/:email", async (req, res) => {
//       try {
//         const email = req.params.email;
//         const user = await usersCollection.findOne({ email });
//         if (!user) {
//           return res.send({ role: "user" }); // default role
//         }
//         res.send({ role: user.role });
//       } catch (error) {
//         console.error("Get user role error:", error);
//         res.status(500).send({ error: "Failed to get user role" });
//       }
//     });

//     // Update user role by user ID (optional)
//     app.patch("/users/role/:id", async (req, res) => {
//       try {
//         const id = req.params.id;
//         const { role } = req.body;

//         if (!role) {
//           return res.status(400).send({ error: "Role is required" });
//         }
//         if (!ObjectId.isValid(id)) {
//           return res.status(400).send({ error: "Invalid user ID" });
//         }

//         const result = await usersCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { role } }
//         );

//         res.send(result);
//       } catch (error) {
//         console.error("Set user role error:", error);
//         res.status(500).send({ error: "Failed to update user role" });
//       }
//     });

//     // =========================
//     // PROPERTIES ROUTES
//     // =========================

//     app.get("/properties", async (req, res) => {
//       const { agentEmail } = req.query;
//       const query = agentEmail ? { agentEmail } : {};
//       try {
//         const properties = await propertiesCollection.find(query).toArray();
//         res.send(properties);
//       } catch (error) {
//         console.error("Error fetching properties:", error);
//         res.status(500).send({ error: "Failed to fetch properties" });
//       }
//     });

//     app.post("/properties", async (req, res) => {
//       try {
//         const property = req.body;
//         if (
//           !property.title ||
//           !property.location ||
//           !property.priceRange ||
//           !property.agentEmail
//         ) {
//           return res.status(400).send({ error: "Missing required fields" });
//         }
//         const result = await propertiesCollection.insertOne(property);
//         res.send(result);
//       } catch (error) {
//         console.error("Add property error:", error);
//         res.status(500).send({ error: "Failed to add property" });
//       }
//     });

//     app.get("/properties/:id", async (req, res) => {
//       const { id } = req.params;
//       if (!ObjectId.isValid(id)) {
//         return res.status(400).send({ error: "Invalid property ID" });
//       }
//       try {
//         const property = await propertiesCollection.findOne({ _id: new ObjectId(id) });
//         if (!property) return res.status(404).send({ error: "Property not found" });
//         res.send(property);
//       } catch (error) {
//         console.error("Get property error:", error);
//         res.status(500).send({ error: "Failed to get property" });
//       }
//     });

//     app.delete("/properties/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) {
//         return res.status(400).send({ error: "Invalid property ID" });
//       }
//       try {
//         const result = await propertiesCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) {
//           return res.status(404).send({ error: "Property not found" });
//         }
//         res.send({ message: "Property deleted successfully" });
//       } catch (error) {
//         console.error("Delete property error:", error);
//         res.status(500).send({ error: "Internal server error" });
//       }
//     });

//     // =========================
//     // WISHLIST ROUTES
//     // =========================

//     app.post("/wishlist", async (req, res) => {
//       const { userEmail, propertyId } = req.body;
//       if (!userEmail || !propertyId) {
//         return res.status(400).send({ error: "Missing userEmail or propertyId" });
//       }
//       if (!ObjectId.isValid(propertyId)) {
//         return res.status(400).send({ error: "Invalid propertyId format" });
//       }
//       try {
//         const exists = await wishlistCollection.findOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//         });
//         if (exists) {
//           return res.status(409).send({ message: "Already in wishlist" });
//         }
//         const result = await wishlistCollection.insertOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//           createdAt: new Date(),
//         });
//         res.send(result);
//       } catch (error) {
//         console.error("Add to wishlist error:", error);
//         res.status(500).send({ error: "Failed to add to wishlist" });
//       }
//     });

//     app.get("/wishlist", async (req, res) => {
//       const { userEmail } = req.query;
//       if (!userEmail) {
//         return res.status(400).send({ error: "Missing userEmail" });
//       }
//       try {
//         const items = await wishlistCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//           ])
//           .toArray();
//         res.send(items);
//       } catch (error) {
//         console.error("Get wishlist error:", error);
//         res.status(500).send({ error: "Failed to get wishlist" });
//       }
//     });

//     app.delete("/wishlist/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) {
//         return res.status(400).send({ error: "Invalid wishlist item ID" });
//       }
//       try {
//         const result = await wishlistCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) {
//           return res.status(404).send({ error: "Wishlist item not found" });
//         }
//         res.send({ message: "Removed from wishlist" });
//       } catch (error) {
//         console.error("Delete wishlist error:", error);
//         res.status(500).send({ error: "Failed to delete from wishlist" });
//       }
//     });

//     // =========================
//     // REVIEWS ROUTES
//     // =========================
// // ✅ Get all reviews by a specific user email
// app.get("/reviews/user/:email", async (req, res) => {
//   const email = req.params.email;
//   try {
//     const reviews = await reviewsCollection.find({ userEmail: email }).toArray();

//     if (!reviews.length) {
//       return res.status(404).send({ message: "No reviews found for this user" });
//     }

//     res.send(reviews);
//   } catch (error) {
//     console.error("Error fetching user reviews:", error);
//     res.status(500).send({ error: "Failed to get user reviews" });
//   }
// });


// // ✅ DELETE a review by ID
// app.delete('/reviews/:id', async (req, res) => {
//   const id = req.params.id;
//   try {
//     const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });

//     if (result.deletedCount === 0) {
//       return res.status(404).send({ message: 'Review not found' });
//     }

//     res.send({ success: true, message: 'Review deleted successfully' });
//   } catch (error) {
//     console.error("Delete error:", error);
//     res.status(500).send({ error: 'Failed to delete review' });
//   }
// });


//     app.get("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       if (!ObjectId.isValid(propertyId)) {
//         return res.status(400).send({ error: "Invalid property ID" });
//       }
//       try {
//         // Reviews store propertyId as string
//         const reviews = await reviewsCollection.find({ propertyId }).toArray();
//         res.send(reviews);
//       } catch (error) {
//         console.error("Get reviews error:", error);
//         res.status(500).send({ error: "Failed to fetch reviews" });
//       }
//     });

//     app.post("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       const review = req.body;
//       if (!ObjectId.isValid(propertyId)) {
//         return res.status(400).send({ error: "Invalid property ID" });
//       }
//       if (!review.userEmail || !review.comment) {
//         return res.status(400).send({ error: "Missing review fields" });
//       }
//       review.propertyId = propertyId; // store as string for consistency
//       review.createdAt = new Date();
//       try {
//         const result = await reviewsCollection.insertOne(review);
//         res.send(result);
//       } catch (error) {
//         console.error("Add review error:", error);
//         res.status(500).send({ error: "Failed to add review" });
//       }
//     });

//     app.get("/reviews/latest", async (req, res) => {
//       try {
//         const latestReviews = await reviewsCollection
//           .aggregate([
//             { $sort: { createdAt: -1 } },
//             { $limit: 3 },
//             {
//               $lookup: {
//                 from: "users",
//                 localField: "userEmail",
//                 foreignField: "email",
//                 as: "user",
//               },
//             },
//             { $unwind: "$user" },
//             {
//               $addFields: {
//                 propertyObjectId: { $toObjectId: "$propertyId" },
//               },
//             },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyObjectId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//             {
//               $project: {
//                 _id: 1,
//                 comment: 1,
//                 createdAt: 1,
//                 "user.name": 1,
//                 "user.photoURL": 1,
//                 "property.title": 1,
//               },
//             },
//           ])
//           .toArray();

//         res.send(latestReviews);
//       } catch (error) {
//         console.error("Failed to get latest reviews:", error);
//         res.status(500).send({ error: "Failed to get latest reviews" });
//       }
//     });

//     // =========================
//     // ROOT ROUTE
//     // =========================

//     app.get("/", (req, res) => {
//       res.send("🏡 Real Estate Server is Running with Wishlist & Role System!");
//     });






//     // =========================
//     // START SERVER
//     // =========================

//     app.listen(port, () => {
//       console.log(`🚀 Server running on port ${port}`);
//     });
//   } catch (err) {
//     console.error("❌ MongoDB connection failed:", err);
//   }
// }

// run();
























// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// dotenv.config();

// const app = express();
// const port = process.env.PORT || 5000;

// app.use(
//   cors({
//     origin: "http://localhost:5173",
//     credentials: true,
//   })
// );
// app.use(express.json());

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djvkmk5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// async function run() {
//   try {
//     await client.connect();
//     console.log("✅ Connected to MongoDB");

//     const db = client.db("realestate");
//     const usersCollection = db.collection("users");
//     const propertiesCollection = db.collection("properties");
//     const reviewsCollection = db.collection("reviews");
//     const wishlistCollection = db.collection("wishlists");

//     // Add or update user (upsert) for registration/login
//     app.post("/users", async (req, res) => {
//       try {
//         const user = req.body;
//         if (!user.email) {
//           return res.status(400).send({ error: "Email is required" });
//         }

//         const existingUser = await usersCollection.findOne({ email: user.email });

//         // Role priority: frontend sent role > existing user role > default 'user'
//         const roleToSet = user.role || (existingUser ? existingUser.role : "user");

//         // Preserve existing name/photoURL if not sent in request
//         const updateData = {
//           name: user.name || (existingUser ? existingUser.name : ""),
//           email: user.email,
//           photoURL: user.photoURL || (existingUser ? existingUser.photoURL : ""),
//           role: roleToSet,
//         };

//         const result = await usersCollection.updateOne(
//           { email: user.email },
//           { $set: updateData },
//           { upsert: true }
//         );

//         res.send({ message: "User saved/updated", result });
//       } catch (error) {
//         console.error("Add/update user error:", error);
//         res.status(500).send({ error: "Failed to add/update user" });
//       }
//     });

//     // Get user role by email
//     app.get("/users/:email", async (req, res) => {
//       try {
//         const email = req.params.email;
//         const user = await usersCollection.findOne({ email });
//         if (!user) {
//           // Instead of 404, send default role to avoid frontend errors
//           return res.send({ role: "user" });
//         }
//         res.send({ role: user.role });
//       } catch (error) {
//         console.error("Get user role error:", error);
//         res.status(500).send({ error: "Failed to get user role" });
//       }
//     });

//     // Update user role by user ID
//     app.patch("/users/role/:id", async (req, res) => {
//       try {
//         const id = req.params.id;
//         const { role } = req.body;
//         if (!role) {
//           return res.status(400).send({ error: "Role is required" });
//         }
//         if (!ObjectId.isValid(id)) {
//           return res.status(400).send({ error: "Invalid user ID" });
//         }
//         const result = await usersCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { role } }
//         );
//         res.send(result);
//       } catch (error) {
//         console.error("Set user role error:", error);
//         res.status(500).send({ error: "Failed to update user role" });
//       }
//     });

//     // Properties CRUD

//     app.get("/properties", async (req, res) => {
//       const { agentEmail } = req.query;
//       const query = agentEmail ? { agentEmail } : {};
//       try {
//         const properties = await propertiesCollection.find(query).toArray();
//         res.send(properties);
//       } catch (error) {
//         console.error("Error fetching properties:", error);
//         res.status(500).send({ error: "Failed to fetch properties" });
//       }
//     });

//     app.post("/properties", async (req, res) => {
//       try {
//         const property = req.body;
//         if (
//           !property.title ||
//           !property.location ||
//           !property.priceRange ||
//           !property.agentEmail
//         ) {
//           return res.status(400).send({ error: "Missing required fields" });
//         }
//         const result = await propertiesCollection.insertOne(property);
//         res.send(result);
//       } catch (error) {
//         console.error("Add property error:", error);
//         res.status(500).send({ error: "Failed to add property" });
//       }
//     });

//     app.get("/properties/:id", async (req, res) => {
//       const { id } = req.params;
//       if (!ObjectId.isValid(id)) {
//         return res.status(400).send({ error: "Invalid property ID" });
//       }
//       try {
//         const property = await propertiesCollection.findOne({ _id: new ObjectId(id) });
//         if (!property) return res.status(404).send({ error: "Property not found" });
//         res.send(property);
//       } catch (error) {
//         console.error("Get property error:", error);
//         res.status(500).send({ error: "Failed to get property" });
//       }
//     });

//     app.delete("/properties/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) {
//         return res.status(400).send({ error: "Invalid property ID" });
//       }
//       try {
//         const result = await propertiesCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) {
//           return res.status(404).send({ error: "Property not found" });
//         }
//         res.send({ message: "Property deleted successfully" });
//       } catch (error) {
//         console.error("Delete property error:", error);
//         res.status(500).send({ error: "Internal server error" });
//       }
//     });

//     // Wishlist

//     app.post("/wishlist", async (req, res) => {
//       const { userEmail, propertyId } = req.body;
//       if (!userEmail || !propertyId) {
//         return res.status(400).send({ error: "Missing userEmail or propertyId" });
//       }
//       if (!ObjectId.isValid(propertyId)) {
//         return res.status(400).send({ error: "Invalid propertyId format" });
//       }
//       try {
//         const exists = await wishlistCollection.findOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//         });
//         if (exists) {
//           return res.status(409).send({ message: "Already in wishlist" });
//         }
//         const result = await wishlistCollection.insertOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//           createdAt: new Date(),
//         });
//         res.send(result);
//       } catch (error) {
//         console.error("Add to wishlist error:", error);
//         res.status(500).send({ error: "Failed to add to wishlist" });
//       }
//     });

//     app.get("/wishlist", async (req, res) => {
//       const { userEmail } = req.query;
//       if (!userEmail) {
//         return res.status(400).send({ error: "Missing userEmail" });
//       }
//       try {
//         const items = await wishlistCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//           ])
//           .toArray();
//         res.send(items);
//       } catch (error) {
//         console.error("Get wishlist error:", error);
//         res.status(500).send({ error: "Failed to get wishlist" });
//       }
//     });

//     app.delete("/wishlist/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) {
//         return res.status(400).send({ error: "Invalid wishlist item ID" });
//       }
//       try {
//         const result = await wishlistCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) {
//           return res.status(404).send({ error: "Wishlist item not found" });
//         }
//         res.send({ message: "Removed from wishlist" });
//       } catch (error) {
//         console.error("Delete wishlist error:", error);
//         res.status(500).send({ error: "Failed to delete from wishlist" });
//       }
//     });

//     // Reviews

//     app.get("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       if (!ObjectId.isValid(propertyId)) {
//         return res.status(400).send({ error: "Invalid property ID" });
//       }
//       try {
//         // Reviews store propertyId as string
//         const reviews = await reviewsCollection
//           .find({ propertyId: propertyId })
//           .toArray();
//         res.send(reviews);
//       } catch (error) {
//         console.error("Get reviews error:", error);
//         res.status(500).send({ error: "Failed to fetch reviews" });
//       }
//     });

//     app.post("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       const review = req.body;
//       if (!ObjectId.isValid(propertyId)) {
//         return res.status(400).send({ error: "Invalid property ID" });
//       }
//       if (!review.userEmail || !review.comment) {
//         return res.status(400).send({ error: "Missing review fields" });
//       }
//       review.propertyId = propertyId; // store as string for consistency
//       review.createdAt = new Date();
//       try {
//         const result = await reviewsCollection.insertOne(review);
//         res.send(result);
//       } catch (error) {
//         console.error("Add review error:", error);
//         res.status(500).send({ error: "Failed to add review" });
//       }
//     });

//     // Latest 3 reviews with user & property info
//     app.get("/reviews/latest", async (req, res) => {
//       try {
//         const latestReviews = await reviewsCollection
//           .aggregate([
//             { $sort: { createdAt: -1 } },
//             { $limit: 3 },
//             {
//               $lookup: {
//                 from: "users",
//                 localField: "userEmail",
//                 foreignField: "email",
//                 as: "user",
//               },
//             },
//             { $unwind: "$user" },
//             {
//               $addFields: {
//                 propertyObjectId: { $toObjectId: "$propertyId" },
//               },
//             },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyObjectId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//             {
//               $project: {
//                 _id: 1,
//                 comment: 1,
//                 createdAt: 1,
//                 "user.name": 1,
//                 "user.photoURL": 1,
//                 "property.title": 1,
//               },
//             },
//           ])
//           .toArray();

//         res.send(latestReviews);
//       } catch (error) {
//         console.error("Failed to get latest reviews:", error);
//         res.status(500).send({ error: "Failed to get latest reviews" });
//       }
//     });

//     // Root route
//     app.get("/", (req, res) => {
//       res.send("🏡 Real Estate Server is Running with Wishlist & Role System!");
//     });

//     app.listen(port, () => {
//       console.log(`🚀 Server running on port ${port}`);
//     });
//   } catch (err) {
//     console.error("❌ MongoDB connection failed:", err);
//   }
// }

// run();


// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// dotenv.config();

// const app = express();
// const port = process.env.PORT || 5000;

// app.use(
//   cors({
//     origin: "http://localhost:5173",
//     credentials: true,
//   })
// );
// app.use(express.json());

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djvkmk5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// async function run() {
//   try {
//     await client.connect();
//     console.log("✅ Connected to MongoDB");

//     const db = client.db("realestate");
//     const usersCollection = db.collection("users");
//     const propertiesCollection = db.collection("properties");
//     const reviewsCollection = db.collection("reviews");
//     const wishlistCollection = db.collection("wishlists");

//     // Add or update user (upsert) for registration/login
//     app.post("/users", async (req, res) => {
//       try {
//         const user = req.body;
//         if (!user.email) {
//           return res.status(400).send({ error: "Email is required" });
//         }
//         // Default role to 'user' if not provided
//         if (!user.role) user.role = "user";

//         // Upsert user: insert if not exist, update if exist
//         const result = await usersCollection.updateOne(
//           { email: user.email },
//           { $set: user },
//           { upsert: true }
//         );

//         res.send({ message: "User saved/updated", result });
//       } catch (error) {
//         console.error("Add/update user error:", error);
//         res.status(500).send({ error: "Failed to add/update user" });
//       }
//     });

//     // Get user role by email
//     app.get("/users/:email", async (req, res) => {
//       try {
//         const email = req.params.email;
//         const user = await usersCollection.findOne({ email });
//         if (!user) return res.status(404).send({ message: "User not found" });
//         res.send({ role: user.role });
//       } catch (error) {
//         console.error("Get user role error:", error);
//         res.status(500).send({ error: "Failed to get user role" });
//       }
//     });

//     // Update user role by user id
//     app.patch("/users/role/:id", async (req, res) => {
//       try {
//         const id = req.params.id;
//         const { role } = req.body;
//         if (!role) {
//           return res.status(400).send({ error: "Role is required" });
//         }
//         if (!ObjectId.isValid(id)) {
//           return res.status(400).send({ error: "Invalid user ID" });
//         }
//         const result = await usersCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { role } }
//         );
//         res.send(result);
//       } catch (error) {
//         console.error("Set user role error:", error);
//         res.status(500).send({ error: "Failed to update user role" });
//       }
//     });

//     // Properties CRUD

//     app.get("/properties", async (req, res) => {
//       const { agentEmail } = req.query;
//       const query = agentEmail ? { agentEmail } : {};
//       try {
//         const properties = await propertiesCollection.find(query).toArray();
//         res.send(properties);
//       } catch (error) {
//         console.error("Error fetching properties:", error);
//         res.status(500).send({ error: "Failed to fetch properties" });
//       }
//     });

//     app.post("/properties", async (req, res) => {
//       try {
//         const property = req.body;
//         if (
//           !property.title ||
//           !property.location ||
//           !property.priceRange ||
//           !property.agentEmail
//         ) {
//           return res.status(400).send({ error: "Missing required fields" });
//         }
//         const result = await propertiesCollection.insertOne(property);
//         res.send(result);
//       } catch (error) {
//         console.error("Add property error:", error);
//         res.status(500).send({ error: "Failed to add property" });
//       }
//     });

//     app.get("/properties/:id", async (req, res) => {
//       const { id } = req.params;
//       if (!ObjectId.isValid(id)) {
//         return res.status(400).send({ error: "Invalid property ID" });
//       }
//       try {
//         const property = await propertiesCollection.findOne({ _id: new ObjectId(id) });
//         if (!property) return res.status(404).send({ error: "Property not found" });
//         res.send(property);
//       } catch (error) {
//         console.error("Get property error:", error);
//         res.status(500).send({ error: "Failed to get property" });
//       }
//     });

//     app.delete("/properties/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) {
//         return res.status(400).send({ error: "Invalid property ID" });
//       }
//       try {
//         const result = await propertiesCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) {
//           return res.status(404).send({ error: "Property not found" });
//         }
//         res.send({ message: "Property deleted successfully" });
//       } catch (error) {
//         console.error("Delete property error:", error);
//         res.status(500).send({ error: "Internal server error" });
//       }
//     });

//     // Wishlist

//     app.post("/wishlist", async (req, res) => {
//       const { userEmail, propertyId } = req.body;
//       if (!userEmail || !propertyId) {
//         return res.status(400).send({ error: "Missing userEmail or propertyId" });
//       }
//       if (!ObjectId.isValid(propertyId)) {
//         return res.status(400).send({ error: "Invalid propertyId format" });
//       }
//       try {
//         const exists = await wishlistCollection.findOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//         });
//         if (exists) {
//           return res.status(409).send({ message: "Already in wishlist" });
//         }
//         const result = await wishlistCollection.insertOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//           createdAt: new Date(),
//         });
//         res.send(result);
//       } catch (error) {
//         console.error("Add to wishlist error:", error);
//         res.status(500).send({ error: "Failed to add to wishlist" });
//       }
//     });

//     app.get("/wishlist", async (req, res) => {
//       const { userEmail } = req.query;
//       if (!userEmail) {
//         return res.status(400).send({ error: "Missing userEmail" });
//       }
//       try {
//         const items = await wishlistCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//           ])
//           .toArray();
//         res.send(items);
//       } catch (error) {
//         console.error("Get wishlist error:", error);
//         res.status(500).send({ error: "Failed to get wishlist" });
//       }
//     });

//     app.delete("/wishlist/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) {
//         return res.status(400).send({ error: "Invalid wishlist item ID" });
//       }
//       try {
//         const result = await wishlistCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) {
//           return res.status(404).send({ error: "Wishlist item not found" });
//         }
//         res.send({ message: "Removed from wishlist" });
//       } catch (error) {
//         console.error("Delete wishlist error:", error);
//         res.status(500).send({ error: "Failed to delete from wishlist" });
//       }
//     });

//     // Reviews

//     app.get("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       if (!ObjectId.isValid(propertyId)) {
//         return res.status(400).send({ error: "Invalid property ID" });
//       }
//       try {
//         // propertyId stored as string in reviews collection? Adjust accordingly:
//         const reviews = await reviewsCollection
//           .find({ propertyId: propertyId }) // Assuming string ID stored
//           .toArray();
//         res.send(reviews);
//       } catch (error) {
//         console.error("Get reviews error:", error);
//         res.status(500).send({ error: "Failed to fetch reviews" });
//       }
//     });

//     app.post("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       const review = req.body;
//       if (!ObjectId.isValid(propertyId)) {
//         return res.status(400).send({ error: "Invalid property ID" });
//       }
//       if (!review.userEmail || !review.comment) {
//         return res.status(400).send({ error: "Missing review fields" });
//       }
//       review.propertyId = propertyId; // store as string for consistency
//       review.createdAt = new Date();
//       try {
//         const result = await reviewsCollection.insertOne(review);
//         res.send(result);
//       } catch (error) {
//         console.error("Add review error:", error);
//         res.status(500).send({ error: "Failed to add review" });
//       }
//     });

//     // Latest 3 reviews with user & property info
//     app.get("/reviews/latest", async (req, res) => {
//       try {
//         const latestReviews = await reviewsCollection
//           .aggregate([
//             { $sort: { createdAt: -1 } },
//             { $limit: 3 },
//             {
//               $lookup: {
//                 from: "users",
//                 localField: "userEmail",
//                 foreignField: "email",
//                 as: "user",
//               },
//             },
//             { $unwind: "$user" },
//             {
//               $addFields: {
//                 propertyObjectId: { $toObjectId: "$propertyId" },
//               },
//             },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyObjectId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//             {
//               $project: {
//                 _id: 1,
//                 comment: 1,
//                 createdAt: 1,
//                 "user.name": 1,
//                 "user.photoURL": 1, // Assuming your users store photoURL, not imageUrl
//                 "property.title": 1,
//               },
//             },
//           ])
//           .toArray();

//         res.send(latestReviews);
//       } catch (error) {
//         console.error("Failed to get latest reviews:", error);
//         res.status(500).send({ error: "Failed to get latest reviews" });
//       }
//     });

//     // Root route
//     app.get("/", (req, res) => {
//       res.send("🏡 Real Estate Server is Running with Wishlist & Role System!");
//     });

//     // Start server
//     app.listen(port, () => {
//       console.log(`🚀 Server running on port ${port}`);
//     });
//   } catch (err) {
//     console.error("❌ MongoDB connection failed:", err);
//   }
// }

// run();


// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// dotenv.config();

// const app = express();
// const port = process.env.PORT || 5000;

// app.use(
//   cors({
//     origin: "http://localhost:5173",
//     credentials: true,
//   })
// );
// app.use(express.json());

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djvkmk5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// async function run() {
//   try {
//     await client.connect();
//     console.log("✅ Connected to MongoDB");

//     const db = client.db("realestate");
//     const usersCollection = db.collection("users");
//     const propertiesCollection = db.collection("properties");
//     const reviewsCollection = db.collection("reviews");
//     const wishlistCollection = db.collection("wishlists");

//     // Add to Wishlist
//     app.post("/wishlist", async (req, res) => {
//       const { userEmail, propertyId } = req.body;

//       if (!userEmail || !propertyId) {
//         return res.status(400).send({ error: "Missing userEmail or propertyId" });
//       }

//       if (!ObjectId.isValid(propertyId)) {
//         return res.status(400).send({ error: "Invalid propertyId format" });
//       }

//       try {
//         const exists = await wishlistCollection.findOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//         });
//         if (exists) {
//           return res.status(409).send({ message: "Already in wishlist" });
//         }

//         const result = await wishlistCollection.insertOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//           createdAt: new Date(),
//         });
//         res.send(result);
//       } catch (error) {
//         console.error("Add to wishlist error:", error);
//         res.status(500).send({ error: "Failed to add to wishlist" });
//       }
//     });

//     // Get Wishlist by userEmail with property details
//     app.get("/wishlist", async (req, res) => {
//       const { userEmail } = req.query;
//       if (!userEmail) {
//         return res.status(400).send({ error: "Missing userEmail" });
//       }

//       try {
//         const items = await wishlistCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//           ])
//           .toArray();

//         res.send(items);
//       } catch (error) {
//         console.error("Get wishlist error:", error);
//         res.status(500).send({ error: "Failed to get wishlist" });
//       }
//     });

//     // Remove from Wishlist
//     app.delete("/wishlist/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) {
//         return res.status(400).send({ error: "Invalid wishlist item ID" });
//       }

//       try {
//         const result = await wishlistCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) {
//           return res.status(404).send({ error: "Wishlist item not found" });
//         }
//         res.send({ message: "Removed from wishlist" });
//       } catch (error) {
//         console.error("Delete wishlist error:", error);
//         res.status(500).send({ error: "Failed to delete from wishlist" });
//       }
//     });

//     // Properties CRUD
//     app.get("/properties", async (req, res) => {
//       const { agentEmail } = req.query;
//       const query = agentEmail ? { agentEmail } : {};

//       try {
//         const properties = await propertiesCollection.find(query).toArray();
//         res.send(properties);
//       } catch (error) {
//         console.error("Error fetching properties:", error);
//         res.status(500).send({ error: "Failed to fetch properties" });
//       }
//     });

//     app.post("/properties", async (req, res) => {
//       try {
//         const property = req.body;
//         if (
//           !property.title ||
//           !property.location ||
//           !property.priceRange ||
//           !property.agentEmail
//         ) {
//           return res.status(400).send({ error: "Missing required fields" });
//         }
//         const result = await propertiesCollection.insertOne(property);
//         res.send(result);
//       } catch (error) {
//         console.error("Add property error:", error);
//         res.status(500).send({ error: "Failed to add property" });
//       }
//     });

//     app.get("/properties/:id", async (req, res) => {
//       const { id } = req.params;
//       if (!ObjectId.isValid(id))
//         return res.status(400).send({ error: "Invalid property ID" });

//       try {
//         const property = await propertiesCollection.findOne({ _id: new ObjectId(id) });
//         if (!property) return res.status(404).send({ error: "Property not found" });
//         res.send(property);
//       } catch (error) {
//         console.error("Get property error:", error);
//         res.status(500).send({ error: "Failed to get property" });
//       }
//     });

//     app.delete("/properties/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id))
//         return res.status(400).send({ error: "Invalid property ID" });

//       try {
//         const result = await propertiesCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0)
//           return res.status(404).send({ error: "Property not found" });
//         res.send({ message: "Property deleted successfully" });
//       } catch (error) {
//         console.error("Delete error:", error);
//         return res.status(500).send({ error: "Internal server error" });
//       }
//     });

//     // Users
//     app.post("/users", async (req, res) => {
//       try {
//         const user = req.body;
//         const existing = await usersCollection.findOne({ email: user.email });
//         if (existing) return res.status(409).send({ message: "User already exists" });

//         if (!user.role) user.role = "user";

//         const result = await usersCollection.insertOne(user);
//         res.send(result);
//       } catch (error) {
//         console.error("Add user error:", error);
//         res.status(500).send({ error: "Failed to add user" });
//       }
//     });

//     app.get("/users/:email", async (req, res) => {
//       try {
//         const email = req.params.email;
//         const user = await usersCollection.findOne({ email });
//         if (!user) return res.status(404).send({ message: "User not found" });
//         res.send({ role: user.role });
//       } catch (error) {
//         console.error("Get user role error:", error);
//         res.status(500).send({ error: "Failed to get user role" });
//       }
//     });

//     app.patch("/users/role/:id", async (req, res) => {
//       try {
//         const id = req.params.id;
//         const { role } = req.body;
//         const result = await usersCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { role } }
//         );
//         res.send(result);
//       } catch (error) {
//         console.error("Set user role error:", error);
//         res.status(500).send({ error: "Failed to update user role" });
//       }
//     });

//     // Reviews
//     app.get("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       if (!ObjectId.isValid(propertyId))
//         return res.status(400).send({ error: "Invalid property ID" });

//       try {
//         const reviews = await reviewsCollection.find({ propertyId }).toArray();
//         res.send(reviews);
//       } catch (error) {
//         console.error("Get reviews error:", error);
//         res.status(500).send({ error: "Failed to fetch reviews" });
//       }
//     });

//     app.post("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       const review = req.body;

//       if (!ObjectId.isValid(propertyId))
//         return res.status(400).send({ error: "Invalid property ID" });
//       if (!review.userEmail || !review.comment)
//         return res.status(400).send({ error: "Missing review fields" });

//       review.propertyId = propertyId;
//       review.createdAt = new Date();

//       try {
//         const result = await reviewsCollection.insertOne(review);
//         res.send(result);
//       } catch (error) {
//         console.error("Add review error:", error);
//         res.status(500).send({ error: "Failed to add review" });
//       }
//     });

//     // --- NEW: Latest 3 user reviews with user & property info
//     app.get("/reviews/latest", async (req, res) => {
//       try {
//         const latestReviews = await reviewsCollection
//           .aggregate([
//             { $sort: { createdAt: -1 } },
//             { $limit: 3 },
//             {
//               $lookup: {
//                 from: "users",
//                 localField: "userEmail",
//                 foreignField: "email",
//                 as: "user",
//               },
//             },
//             { $unwind: "$user" },
//             {
//               $addFields: {
//                 propertyObjectId: { $toObjectId: "$propertyId" },
//               },
//             },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyObjectId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//             {
//               $project: {
//                 _id: 1,
//                 comment: 1,
//                 createdAt: 1,
//                 "user.name": 1,
//                 "user.imageUrl": 1,
//                 "property.title": 1,
//               },
//             },
//           ])
//           .toArray();

//         res.send(latestReviews);
//       } catch (error) {
//         console.error("Failed to get latest reviews:", error);
//         res.status(500).send({ error: "Failed to get latest reviews" });
//       }
//     });

//     // Root route
//     app.get("/", (req, res) => {
//       res.send("🏡 Real Estate Server is Running with Wishlist & Role System!");
//     });

//     // Start server
//     app.listen(port, () => {
//       console.log(`🚀 Server running on port ${port}`);
//     });
//   } catch (err) {
//     console.error("❌ MongoDB connection failed:", err);
//   }
// }

// run();












// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// dotenv.config();

// const app = express();
// const port = process.env.PORT || 5000;

// app.use(
//   cors({
//     origin: "http://localhost:5173",
//     credentials: true,
//   })
// );
// app.use(express.json());

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djvkmk5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// async function run() {
//   try {
//     await client.connect();
//     console.log("✅ Connected to MongoDB");

//     const db = client.db("realestate");
//     const usersCollection = db.collection("users");
//     const propertiesCollection = db.collection("properties");
//     const reviewsCollection = db.collection("reviews");
//     const wishlistCollection = db.collection("wishlists");

//     // Add to Wishlist
//     app.post("/wishlist", async (req, res) => {
//       const { userEmail, propertyId } = req.body;

//       if (!userEmail || !propertyId) {
//         return res.status(400).send({ error: "Missing userEmail or propertyId" });
//       }

//       // Validate propertyId as ObjectId
//       if (!ObjectId.isValid(propertyId)) {
//         return res.status(400).send({ error: "Invalid propertyId format" });
//       }

//       try {
//         // Check duplicate based on userEmail and propertyId ObjectId
//         const exists = await wishlistCollection.findOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//         });
//         if (exists) {
//           return res.status(409).send({ message: "Already in wishlist" });
//         }

//         const result = await wishlistCollection.insertOne({
//           userEmail,
//           propertyId: new ObjectId(propertyId),
//           createdAt: new Date(),
//         });
//         res.send(result);
//       } catch (error) {
//         console.error("Add to wishlist error:", error);
//         res.status(500).send({ error: "Failed to add to wishlist" });
//       }
//     });

//     // Get Wishlist by userEmail with property details
//     app.get("/wishlist", async (req, res) => {
//       const { userEmail } = req.query;
//       if (!userEmail) {
//         return res.status(400).send({ error: "Missing userEmail" });
//       }

//       try {
//         const items = await wishlistCollection
//           .aggregate([
//             { $match: { userEmail } },
//             {
//               $lookup: {
//                 from: "properties",
//                 localField: "propertyId",
//                 foreignField: "_id",
//                 as: "property",
//               },
//             },
//             { $unwind: "$property" },
//           ])
//           .toArray();

//         res.send(items);
//       } catch (error) {
//         console.error("Get wishlist error:", error);
//         res.status(500).send({ error: "Failed to get wishlist" });
//       }
//     });

//     // Remove from Wishlist
//     app.delete("/wishlist/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) {
//         return res.status(400).send({ error: "Invalid wishlist item ID" });
//       }

//       try {
//         const result = await wishlistCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) {
//           return res.status(404).send({ error: "Wishlist item not found" });
//         }
//         res.send({ message: "Removed from wishlist" });
//       } catch (error) {
//         console.error("Delete wishlist error:", error);
//         res.status(500).send({ error: "Failed to delete from wishlist" });
//       }
//     });

//     // Properties CRUD
//     app.get("/properties", async (req, res) => {
//       const { agentEmail } = req.query;
//       const query = agentEmail ? { agentEmail } : {};

//       try {
//         const properties = await propertiesCollection.find(query).toArray();
//         res.send(properties);
//       } catch (error) {
//         console.error("Error fetching properties:", error);
//         res.status(500).send({ error: "Failed to fetch properties" });
//       }
//     });

//     app.post("/properties", async (req, res) => {
//       try {
//         const property = req.body;
//         if (!property.title || !property.location || !property.priceRange || !property.agentEmail) {
//           return res.status(400).send({ error: "Missing required fields" });
//         }
//         const result = await propertiesCollection.insertOne(property);
//         res.send(result);
//       } catch (error) {
//         console.error("Add property error:", error);
//         res.status(500).send({ error: "Failed to add property" });
//       }
//     });

//     app.get("/properties/:id", async (req, res) => {
//       const { id } = req.params;
//       if (!ObjectId.isValid(id)) return res.status(400).send({ error: "Invalid property ID" });

//       try {
//         const property = await propertiesCollection.findOne({ _id: new ObjectId(id) });
//         if (!property) return res.status(404).send({ error: "Property not found" });
//         res.send(property);
//       } catch (error) {
//         console.error("Get property error:", error);
//         res.status(500).send({ error: "Failed to get property" });
//       }
//     });

//     app.delete("/properties/:id", async (req, res) => {
//       const id = req.params.id;
//       if (!ObjectId.isValid(id)) return res.status(400).send({ error: "Invalid property ID" });

//       try {
//         const result = await propertiesCollection.deleteOne({ _id: new ObjectId(id) });
//         if (result.deletedCount === 0) return res.status(404).send({ error: "Property not found" });
//         res.send({ message: "Property deleted successfully" });
//       } catch (error) {
//         console.error("Delete error:", error);
//         return res.status(500).send({ error: "Internal server error" });
//       }
//     });

//     // Users
//     app.post("/users", async (req, res) => {
//       try {
//         const user = req.body;
//         const existing = await usersCollection.findOne({ email: user.email });
//         if (existing) return res.status(409).send({ message: "User already exists" });

//         if (!user.role) user.role = "user";

//         const result = await usersCollection.insertOne(user);
//         res.send(result);
//       } catch (error) {
//         console.error("Add user error:", error);
//         res.status(500).send({ error: "Failed to add user" });
//       }
//     });

//     app.get("/users/:email", async (req, res) => {
//       try {
//         const email = req.params.email;
//         const user = await usersCollection.findOne({ email });
//         if (!user) return res.status(404).send({ message: "User not found" });
//         res.send({ role: user.role });
//       } catch (error) {
//         console.error("Get user role error:", error);
//         res.status(500).send({ error: "Failed to get user role" });
//       }
//     });

//     app.patch("/users/role/:id", async (req, res) => {
//       try {
//         const id = req.params.id;
//         const { role } = req.body;
//         const result = await usersCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { role } }
//         );
//         res.send(result);
//       } catch (error) {
//         console.error("Set user role error:", error);
//         res.status(500).send({ error: "Failed to update user role" });
//       }
//     });

//     // Reviews
//     app.get("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       if (!ObjectId.isValid(propertyId)) return res.status(400).send({ error: "Invalid property ID" });

//       try {
//         const reviews = await reviewsCollection.find({ propertyId }).toArray();
//         res.send(reviews);
//       } catch (error) {
//         console.error("Get reviews error:", error);
//         res.status(500).send({ error: "Failed to fetch reviews" });
//       }
//     });

//     app.post("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       const review = req.body;

//       if (!ObjectId.isValid(propertyId)) return res.status(400).send({ error: "Invalid property ID" });
//       if (!review.userEmail || !review.comment) return res.status(400).send({ error: "Missing review fields" });

//       review.propertyId = propertyId;
//       review.createdAt = new Date();

//       try {
//         const result = await reviewsCollection.insertOne(review);
//         res.send(result);
//       } catch (error) {
//         console.error("Add review error:", error);
//         res.status(500).send({ error: "Failed to add review" });
//       }
//     });

//     // Root route
//     app.get("/", (req, res) => {
//       res.send("🏡 Real Estate Server is Running with Wishlist & Role System!");
//     });

//     // Start server
//     app.listen(port, () => {
//       console.log(`🚀 Server running on port ${port}`);
//     });
//   } catch (err) {
//     console.error("❌ MongoDB connection failed:", err);
//   }
// }

// run();



// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// dotenv.config();

// const app = express();
// const port = process.env.PORT || 5000;

// app.use(cors({
//   origin: "http://localhost:5173",
//   credentials: true
// }));
// app.use(express.json());

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djvkmk5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// let db;

// async function run() {
//   try {
//     await client.connect();
//     console.log("✅ Connected to MongoDB");

//     db = client.db("realestate");

//     const usersCollection = db.collection("users");
//     const propertiesCollection = db.collection("properties");
//     const reviewsCollection = db.collection("reviews");  // NEW collection for reviews

//     // 🔸 Get All or Filter Properties (filter by agentEmail optional)
//     app.get("/properties", async (req, res) => {
//       const { agentEmail } = req.query;
//       const query = agentEmail ? { agentEmail } : {};

//       try {
//         const properties = await propertiesCollection.find(query).toArray();
//         res.send(properties);
//       } catch (error) {
//         console.error("Error fetching properties:", error);
//         res.status(500).send({ error: "Failed to fetch properties" });
//       }
//     });

//     // 🔸 Add New Property
//     app.post("/properties", async (req, res) => {
//       try {
//         const property = req.body;

//         if (!property.title || !property.location || !property.priceRange || !property.agentEmail) {
//           return res.status(400).send({ error: "Missing required fields" });
//         }

//         const result = await propertiesCollection.insertOne(property);
//         res.send(result);
//       } catch (error) {
//         console.error("Add property error:", error);
//         res.status(500).send({ error: "Failed to add property" });
//       }
//     });

//     // 🔸 Get Single Property by ID
//     app.get("/properties/:id", async (req, res) => {
//       const { id } = req.params;

//       if (!ObjectId.isValid(id)) {
//         return res.status(400).send({ error: "Invalid property ID" });
//       }

//       try {
//         const property = await propertiesCollection.findOne({ _id: new ObjectId(id) });

//         if (!property) {
//           return res.status(404).send({ error: "Property not found" });
//         }

//         res.send(property);
//       } catch (error) {
//         console.error("Get property error:", error);
//         res.status(500).send({ error: "Failed to get property" });
//       }
//     });

//     // 🔸 Delete Property by ID
//     app.delete("/properties/:id", async (req, res) => {
//       const id = req.params.id;

//       if (!ObjectId.isValid(id)) {
//         return res.status(400).send({ error: "Invalid property ID" });
//       }

//       try {
//         const result = await propertiesCollection.deleteOne({ _id: new ObjectId(id) });

//         if (result.deletedCount === 1) {
//           return res.status(200).send({ message: "Property deleted successfully" });
//         } else {
//           return res.status(404).send({ error: "Property not found" });
//         }
//       } catch (error) {
//         console.error("Delete error:", error);
//         return res.status(500).send({ error: "Internal server error" });
//       }
//     });

//     // 🔸 Add User (with role)
//     app.post("/users", async (req, res) => {
//       try {
//         const user = req.body;

//         const existing = await usersCollection.findOne({ email: user.email });
//         if (existing) {
//           return res.status(409).send({ message: "User already exists" });
//         }

//         if (!user.role) {
//           user.role = "user";
//         }

//         const result = await usersCollection.insertOne(user);
//         res.send(result);
//       } catch (error) {
//         console.error("Add user error:", error);
//         res.status(500).send({ error: "Failed to add user" });
//       }
//     });

//     // 🔸 Get Single User Role
//     app.get("/users/:email", async (req, res) => {
//       try {
//         const email = req.params.email;
//         const user = await usersCollection.findOne({ email });

//         if (!user) {
//           return res.status(404).send({ message: "User not found" });
//         }

//         res.send({ role: user.role });
//       } catch (error) {
//         console.error("Get user role error:", error);
//         res.status(500).send({ error: "Failed to get user role" });
//       }
//     });

//     // 🔸 Set user role (admin panel)
//     app.patch("/users/role/:id", async (req, res) => {
//       try {
//         const id = req.params.id;
//         const { role } = req.body;

//         const result = await usersCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { role } }
//         );

//         res.send(result);
//       } catch (error) {
//         console.error("Set user role error:", error);
//         res.status(500).send({ error: "Failed to update user role" });
//       }
//     });


//     // 🔸 Get all reviews for a property
//     app.get("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;

//       if (!ObjectId.isValid(propertyId)) {
//         return res.status(400).send({ error: "Invalid property ID" });
//       }

//       try {
//         // Note: stored propertyId as string in reviews, so use string matching
//         const reviews = await reviewsCollection.find({ propertyId }).toArray();
//         res.send(reviews);
//       } catch (error) {
//         console.error("Get reviews error:", error);
//         res.status(500).send({ error: "Failed to fetch reviews" });
//       }
//     });

//     // 🔸 Add a review for a property
//     app.post("/properties/:id/reviews", async (req, res) => {
//       const propertyId = req.params.id;
//       const review = req.body;

//       if (!ObjectId.isValid(propertyId)) {
//         return res.status(400).send({ error: "Invalid property ID" });
//       }

//       if (!review.userEmail || !review.comment) {
//         return res.status(400).send({ error: "Missing review fields" });
//       }

//       review.propertyId = propertyId;
//       review.createdAt = new Date();

//       try {
//         const result = await reviewsCollection.insertOne(review);
//         res.send(result);
//       } catch (error) {
//         console.error("Add review error:", error);
//         res.status(500).send({ error: "Failed to add review" });
//       }
//     });

//     // Root route
//     app.get("/", (req, res) => {
//       res.send("🏡 Real Estate Server with Role System is Running!");
//     });

//     // Start server
//     app.listen(port, () => {
//       console.log(`🚀 Server is running on port ${port}`);
//     });
//   } catch (err) {
//     console.error("❌ MongoDB connection failed:", err);
//   }
// }

// run();


// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// dotenv.config();

// const app = express();
// const port = process.env.PORT || 5000;

// app.use(cors({
//   origin: "http://localhost:5173",
//   credentials: true
// }));
// app.use(express.json());

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djvkmk5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// let db;

// async function run() {
//   try {
//     await client.connect();
//     console.log("✅ Connected to MongoDB");

//     db = client.db("realestate");

//     const usersCollection = db.collection("users");
//     const propertiesCollection = db.collection("properties");

//     // 🔸 Get All or Filter Properties (filter by agentEmail optional)
//     app.get("/properties", async (req, res) => {
//       const { agentEmail } = req.query;
//       const query = agentEmail ? { agentEmail } : {};

//       try {
//         const properties = await propertiesCollection.find(query).toArray();
//         res.send(properties);
//       } catch (error) {
//         console.error("Error fetching properties:", error);
//         res.status(500).send({ error: "Failed to fetch properties" });
//       }
//     });

//     // 🔸 Add New Property
//     app.post("/properties", async (req, res) => {
//       try {
//         const property = req.body;

//         if (!property.title || !property.location || !property.priceRange || !property.agentEmail) {
//           return res.status(400).send({ error: "Missing required fields" });
//         }

//         const result = await propertiesCollection.insertOne(property);
//         res.send(result);
//       } catch (error) {
//         console.error("Add property error:", error);
//         res.status(500).send({ error: "Failed to add property" });
//       }
//     });

//     // 🔸 Add User (with role)
//     app.post("/users", async (req, res) => {
//       try {
//         const user = req.body;

//         const existing = await usersCollection.findOne({ email: user.email });
//         if (existing) {
//           return res.status(409).send({ message: "User already exists" });
//         }

//         if (!user.role) {
//           user.role = "user";
//         }

//         const result = await usersCollection.insertOne(user);
//         res.send(result);
//       } catch (error) {
//         console.error("Add user error:", error);
//         res.status(500).send({ error: "Failed to add user" });
//       }
//     });

//     // 🔸 Get Single User Role
//     app.get("/users/:email", async (req, res) => {
//       try {
//         const email = req.params.email;
//         const user = await usersCollection.findOne({ email });

//         if (!user) {
//           return res.status(404).send({ message: "User not found" });
//         }

//         res.send({ role: user.role });
//       } catch (error) {
//         console.error("Get user role error:", error);
//         res.status(500).send({ error: "Failed to get user role" });
//       }
//     });

//     // 🔸 Set user role (admin panel)
//     app.patch("/users/role/:id", async (req, res) => {
//       try {
//         const id = req.params.id;
//         const { role } = req.body;

//         const result = await usersCollection.updateOne(
//           { _id: new ObjectId(id) },
//           { $set: { role } }
//         );

//         res.send(result);
//       } catch (error) {
//         console.error("Set user role error:", error);
//         res.status(500).send({ error: "Failed to update user role" });
//       }
//     });


//     // 🔸 Get Single Property by ID
// app.get("/properties/:id", async (req, res) => {
//   const { id } = req.params;

//   if (!ObjectId.isValid(id)) {
//     return res.status(400).send({ error: "Invalid property ID" });
//   }

//   try {
//     const property = await propertiesCollection.findOne({ _id: new ObjectId(id) });

//     if (!property) {
//       return res.status(404).send({ error: "Property not found" });
//     }

//     res.send(property);
//   } catch (error) {
//     console.error("Get property error:", error);
//     res.status(500).send({ error: "Failed to get property" });
//   }
// });







//     // 🔸 Delete Property by ID
//     app.delete("/properties/:id", async (req, res) => {
//       const id = req.params.id;

//       if (!ObjectId.isValid(id)) {
//         return res.status(400).send({ error: "Invalid property ID" });
//       }

//       try {
//         const result = await propertiesCollection.deleteOne({ _id: new ObjectId(id) });

//         if (result.deletedCount === 1) {
//           return res.status(200).send({ message: "Property deleted successfully" });
//         } else {
//           return res.status(404).send({ error: "Property not found" });
//         }
//       } catch (error) {
//         console.error("Delete error:", error);
//         return res.status(500).send({ error: "Internal server error" });
//       }
//     });

//     // Root route
//     app.get("/", (req, res) => {
//       res.send("🏡 Real Estate Server with Role System is Running!");
//     });

//     // Start server
//     app.listen(port, () => {
//       console.log(`🚀 Server is running on port ${port}`);
//     });
//   } catch (err) {
//     console.error("❌ MongoDB connection failed:", err);
//   }
// }

// run();


// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// dotenv.config();

// const app = express();
// const port = process.env.PORT || 5000;

// app.use(cors({
//   origin: "http://localhost:5173",
//   credentials: true
// }));
// app.use(express.json());

// // MongoDB URI
// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djvkmk5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// let db;

// async function run() {
//   try {
//     await client.connect();
//     console.log("✅ Connected to MongoDB");

//     db = client.db("realestate");

//     const usersCollection = db.collection("users");
//     const propertiesCollection = db.collection("properties");

//     // 🔸 Get All Properties
//     app.get("/properties", async (req, res) => {
//       const all = await propertiesCollection.find().toArray();
//       res.send(all);
//     });

//     // 🔸 Add User (with role)
//     app.post("/users", async (req, res) => {
//       const user = req.body;

//       // Check if user already exists
//       const existing = await usersCollection.findOne({ email: user.email });
//       if (existing) {
//         return res.status(409).send({ message: "User already exists" });
//       }

//       // Set default role if not provided
//       if (!user.role) {
//         user.role = "user";
//       }

//       const result = await usersCollection.insertOne(user);
//       res.send(result);
//     });

//     // 🔸 Get Single User Role
//     app.get("/users/:email", async (req, res) => {
//       const email = req.params.email;
//       const user = await usersCollection.findOne({ email });

//       if (!user) {
//         return res.status(404).send({ message: "User not found" });
//       }

//       res.send({ role: user.role });
//     });

//     // 🔸 Set user role (admin panel use case)
//     app.patch("/users/role/:id", async (req, res) => {
//       const id = req.params.id;
//       const { role } = req.body;

//       const result = await usersCollection.updateOne(
//         { _id: new ObjectId(id) },
//         { $set: { role } }
//       );

//       res.send(result);
//     });

//     // Root route
//     app.get("/", (req, res) => {
//       res.send("🏡 Real Estate Server with Role System is Running!");
//     });

//     // Start server
//     app.listen(port, () => {
//       console.log(`🚀 Server is running on port ${port}`);
//     });
//   } catch (err) {
//     console.error("❌ MongoDB connection failed:", err);
//   }
// }

// run();










// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { MongoClient, ServerApiVersion } = require("mongodb");

// // Load environment variables
// dotenv.config();

// const app = express();
// const port = process.env.PORT || 5000;

// // Middleware
// app.use(cors());
// app.use(express.json());

// // MongoDB URI and Client
// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djvkmk5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// let db;

// async function run() {
//   try {
//     // Connect client
//     await client.connect();
//     console.log("✅ Connected to MongoDB");

//     // Select database
//     db = client.db("realestate");

//     // Collections (example)
//     const usersCollection = db.collection("users");
//     const propertiesCollection = db.collection("properties");

//     // Example GET route to fetch properties
//     app.get("/properties", async (req, res) => {
//       const all = await propertiesCollection.find().toArray();
//       res.send(all);
//     });

//     // Example POST route to add user
//     app.post("/users", async (req, res) => {
//       const user = req.body;
//       const result = await usersCollection.insertOne(user);
//       res.send(result);
//     });

//     // Start the server
//     app.listen(port, () => {
//       console.log(`🚀 Server is running on port ${port}`);
//     });
//   } catch (err) {
//     console.error("❌ MongoDB connection failed:", err);
//   }
// }

// run();










// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const { MongoClient, ServerApiVersion } = require('mongodb');

// // Load environment variables from .env file
// dotenv.config();

// const app = express();
// const port = process.env.PORT || 5000;



// // ad mongo


// const uri = `
// mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djvkmk5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
// `;

// // Create a MongoClient with a MongoClientOptions object to set the Stable API version
// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   }
// });

// async function run() {
//   try {
//     // Connect the client to the server	(optional starting in v4.7)
//     await client.connect();
//     // Send a ping to confirm a successful connection
//     await client.db("admin").command({ ping: 1 });
//     console.log("Pinged your deployment. You successfully connected to MongoDB!");
//   } finally {
//     // Ensures that the client will close when you finish/error
//     await client.close();
//   }
// }
// run().catch(console.dir);




// // Middleware
// app.use(cors()); // Enable CORS for all origins (you can restrict it later)
// app.use(express.json()); // To parse JSON request bodies

// // Basic test route
// app.get('/', (req, res) =>{
//   res.send('RealEstate Server IS runing');
// });

// // Start the server
// app.listen(port, () => {
//   console.log(`Server is ready on port ${port}`);
// });

