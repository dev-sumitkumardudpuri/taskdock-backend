import Workspace from "../models/workspace.js";
import mongoose from "mongoose";

export const checkWorkspaceRole = (allowedRoles = ["admin", "member"]) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?._id ? req.user._id.toString() : req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: User identification missing",
        });
      }

      const workspaceId =
        req.body?.workspaceId ||
        req.params?.workspaceId ||
        req.query?.workspaceId ||
        req.headers["x-workspace-id"];

      if (!workspaceId || !mongoose.Types.ObjectId.isValid(workspaceId)) {
        return res.status(400).json({
          success: false,
          message: "Valid Workspace ID is required for permission check",
        });
      }

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) {
        return res
          .status(404)
          .json({ success: false, message: "Workspace not found" });
      }

      const isOwner = workspace.owner.toString() === userId;
      if (isOwner) {
        req.userRole = "admin";
        req.workspace = workspace;
        return next();
      }

      const member = workspace.members.find((m) => {
        const memberUserId = m.user?._id
          ? m.user._id.toString()
          : m.user?.toString();
        return memberUserId === userId;
      });

      if (!member || !allowedRoles.includes(member.role)) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied: You do not have permission to perform this action in this workspace!",
        });
      }

      req.userRole = member.role;
      req.workspace = workspace;
      next();
    } catch (error) {
      console.error("RBAC Error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  };
};
