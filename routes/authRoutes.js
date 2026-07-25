import express from "express";
import {
  signup,
  login,
  googleLogin,
  getMe,
  updateProfile,
} from "../controllers/authController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/google-login", googleLogin);

router.get("/me", protect, getMe);
router.put("/profile", protect, updateProfile);

export default router;
