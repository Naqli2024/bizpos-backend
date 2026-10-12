const User = require("../user/user.model");
const Business = require("./business.model");
const bcrypt = require("bcryptjs");
const { randomInt } = require("crypto");

const createBusiness = async (req, res) => {
  let business;

  try {
    const {
      businessName,
      address,
      mobile,
      gstNo,
      businessType,
      logo,
      username,
      password,
    } = req.body;

    if (
      !businessName?.trim() ||
      !mobile?.trim() ||
      !username?.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Business name, mobile, username and password are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    const normalizedMobile = mobile.trim();
    const normalizedUsername = username.trim();
    const normalizedGst = gstNo?.trim().toUpperCase() || "";

    // Check duplicate mobile
    const existingMobile = await Business.findOne({
      mobile: normalizedMobile,
    });

    if (existingMobile) {
      return res.status(409).json({
        success: false,
        message: "Mobile number already registered",
      });
    }

    // Check duplicate GST when provided
    if (normalizedGst) {
      const existingGst = await Business.findOne({
        gstNo: normalizedGst,
      });

      if (existingGst) {
        return res.status(409).json({
          success: false,
          message: "GST number already registered",
        });
      }
    }

    // Check duplicate username
    const existingUser = await User.findOne({
      username: normalizedUsername,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Username already exists",
      });
    }

    // Generate a six-digit OTP as a string
    const otp = randomInt(100000, 1000000).toString();

    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // 1. Create business with unverified mobile
    business = await Business.create({
      businessName: businessName.trim(),
      address,
      mobile: normalizedMobile,
      gstNo: normalizedGst,
      businessType,
      logo,
      otp,
      otpExpiresAt,
      isVerified: false,
    });

    // 2. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Create associated user
    const user = await User.create({
      businessId: business._id,
      username: normalizedUsername,
      password: hashedPassword,
      role: "admin",
    });

    return res.status(201).json({
      success: true,
      message: "Business registered. Please verify your mobile number.",
      data: {
        businessId: business._id,
        businessName: business.businessName,
        mobile: business.mobile,
        isVerified: business.isVerified,
        user: {
          _id: user._id,
          username: user.username,
          role: user.role,
        },
      },
    });
  } catch (error) {
    // Avoid leaving an orphaned business if user creation fails
    if (business?._id) {
      await Business.findByIdAndDelete(business._id).catch(() => {});
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Mobile, GST number or username already exists",
      });
    }

    console.error("Business registration error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to register business",
    });
  }
};

const verifyMobile = async (req, res) => {
  try {
    const { mobileNumber, otp } = req.body;

    if (!mobileNumber?.trim() || !otp) {
      return res.status(400).json({
        success: false,
        message: "Mobile number and OTP are required",
      });
    }

    if (!/^\d{6}$/.test(String(otp))) {
      return res.status(400).json({
        success: false,
        message: "OTP must be a valid six-digit number",
      });
    }

    const business = await Business.findOne({
      mobile: mobileNumber.trim(),
    }).select("+otp +otpExpiresAt");

    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found for this mobile number",
      });
    }

    if (business.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Mobile number is already verified",
      });
    }

    if (!business.otpExpiresAt) {
      console.log("OTP expiry missing for business:", business._id);

      return res.status(400).json({
        success: false,
        message: "OTP expiry is missing. Please request a new OTP.",
      });
    }

    if (business.otp !== String(otp)) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    if (business.otpExpiresAt <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new OTP.",
      });
    }

    business.isVerified = true;
    business.otp = undefined;
    business.otpExpiresAt = undefined;

    await business.save();

    return res.status(200).json({
      success: true,
      message: "Mobile number verified successfully",
      data: {
        businessId: business._id,
        businessName: business.businessName,
        mobile: business.mobile,
        isVerified: business.isVerified,
      },
    });
  } catch (error) {
    console.error("Mobile verification error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to verify mobile number",
    });
  }
};

const updateBusiness = async (req, res) => {
  try {
    // Get business ID from the verified JWT
    const businessId = req.user.businessId;

    const {
      businessName,
      address,
      mobile,
      gstNo,
      businessType,
      logo,
      username,
      password,
    } = req.body;

    // Find the authenticated business
    const business = await Business.findById(businessId);

    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found",
      });
    }

    // Find the user belonging to this business
    const user = await User.findOne({ businessId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Business user not found",
      });
    }

    // Validate supplied values
    if (businessName !== undefined && !businessName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Business name cannot be empty",
      });
    }

    if (mobile !== undefined && !mobile.trim()) {
      return res.status(400).json({
        success: false,
        message: "Mobile number cannot be empty",
      });
    }

    if (username !== undefined && !username.trim()) {
      return res.status(400).json({
        success: false,
        message: "Username cannot be empty",
      });
    }

    if (
      password !== undefined &&
      (typeof password !== "string" || password.length < 8)
    ) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    // Check for duplicate mobile number
    if (mobile !== undefined && mobile.trim() !== business.mobile) {
      const existingBusiness = await Business.findOne({
        mobile: mobile.trim(),
        _id: { $ne: business._id },
      });

      if (existingBusiness) {
        return res.status(409).json({
          success: false,
          message: "Mobile number is already registered",
        });
      }
    }

    // Check for duplicate GST number
    if (gstNo !== undefined && gstNo.trim()) {
      const existingGST = await Business.findOne({
        gstNo: gstNo.trim(),
        _id: { $ne: business._id },
      });

      if (existingGST) {
        return res.status(409).json({
          success: false,
          message: "GST number is already registered",
        });
      }
    }

    // Check for duplicate username
    if (username !== undefined && username.trim() !== user.username) {
      const existingUser = await User.findOne({
        username: username.trim(),
        _id: { $ne: user._id },
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "Username is already taken",
        });
      }
    }

    // Update business fields only when supplied
    if (businessName !== undefined) {
      business.businessName = businessName.trim();
    }

    if (address !== undefined) {
      business.address = address.trim();
    }

    if (gstNo !== undefined) {
      business.gstNo = gstNo.trim();
    }

    if (businessType !== undefined) {
      business.businessType = businessType.trim();
    }

    if (logo !== undefined) {
      business.logo = logo;
    }

    // If the mobile number changes, require verification again
    let mobileVerificationRequired = false;
    let developmentOtp;

    if (mobile !== undefined && mobile.trim() !== business.mobile) {
      const otp = randomInt(100000, 1000000).toString();

      business.mobile = mobile.trim();
      business.isVerified = false;
      business.otp = otp;
      business.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

      mobileVerificationRequired = true;

      // For local development only; integrate SMS delivery for production
      if (process.env.NODE_ENV !== "production") {
        developmentOtp = otp;
      }
    }

    // Update user fields
    if (username !== undefined) {
      user.username = username.trim();
    }

    if (password !== undefined) {
      user.password = await bcrypt.hash(password, 10);
    }

    // Save both documents
    await business.save();
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Business account updated successfully",
      mobileVerificationRequired,
      ...(developmentOtp ? { developmentOtp } : {}),
      data: {
        business: {
          businessId: business._id,
          businessName: business.businessName,
          address: business.address,
          mobile: business.mobile,
          gstNo: business.gstNo,
          businessType: business.businessType,
          logo: business.logo,
          isVerified: business.isVerified,
        },
        user: {
          adminId: user._id,
          username: user.username,
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error("Update business error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A value already exists and must be unique",
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update business account",
    });
  }
};

const getBusinessDetailsById = async (req, res) => {
  try {
    // Get businessId from the verified JWT
    const businessId = req.user.businessId;

    const business = await Business.findById(businessId).select(
      "-otp -otpExpiresAt"
    );

    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found",
      });
    }

    // Find the user associated with this business
    const user = await User.findOne({ businessId }).select(
      "username role"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Business user not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Business details fetched successfully",
      data: {
        businessId: business._id,
        businessName: business.businessName,
        address: business.address,
        mobile: business.mobile,
        gstNo: business.gstNo,
        businessType: business.businessType,
        logo: business.logo,
        isVerified: business.isVerified,
        username: user.username,
        role: user.role,
        createdAt: business.createdAt,
        updatedAt: business.updatedAt,
      },
    });
  } catch (error) {
    console.error("Get business details error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch business details",
    });
  }
};

module.exports = { createBusiness, verifyMobile, updateBusiness, getBusinessDetailsById };