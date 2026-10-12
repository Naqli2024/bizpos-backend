const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("./user.model");
const Business = require("../business/business.model");

const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate required fields
    if (!username?.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    // Find user
    const user = await User.findOne({
      username: username.trim(),
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });
    }

    // Find associated business
    const business = await Business.findById(user.businessId);

    if (!business) {
      return res.status(401).json({
        success: false,
        message: "Associated business not found",
      });
    }

    // Only verified businesses can log in
    if (!business.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your mobile number before logging in",
      });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        businessId: user.businessId.toString(),
        adminId: user._id.toString(),
      },
      process.env.JSON_WEB_TOKEN,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "1d",
      },
    );

    // Set JWT in browser cookie
    res.cookie("bizpos_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      path: "/",
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      data: {
        adminId: user._id,
        businessId: user.businessId,
        username: user.username,
        role: user.role,
        businessName: business.businessName,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
};

module.exports = { login };
