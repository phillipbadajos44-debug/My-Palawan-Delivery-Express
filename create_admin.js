require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const MONGO_URI = process.env.MONGODB_URI;

const UserSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.model("User", UserSchema, "users");

async function createAdmin() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const existing = await User.findOne({ role: "admin" });

    if (existing) {
      console.log("⚠️ Admin already exists.");
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash("PalawanPhillip90!", 10);

    await User.create({
      username: "palawan_admin",
      email: "admin@palawandelivery.ph",
      password: hashedPassword,
      role: "admin",
      createdAt: new Date()
    });

    console.log("🎉 SUCCESS!");
    console.log("Username: palawan_admin");
    console.log("Password: PalawanPhillip90!");

    process.exit(0);

  } catch (err) {
    console.error("❌ ERROR:", err.message);
    process.exit(1);
  }
}

createAdmin();
