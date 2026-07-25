import Workspace from "../models/workspace.js";
import Board from "../models/board.js";
import ActivityLog from "../models/activitylog.js";
import Invitation from "../models/invitation.js";
import User from "../models/user.js";
import { getIO } from "../socket.js";

const emitSocketToUser = (userId, eventName, payload) => {
  try {
    const io = getIO();
    if (io && userId) {
      io.to(`user_${userId.toString()}`).emit(eventName, payload);
    }
  } catch (err) {
    console.log("Socket emit skipped:", err.message);
  }
};

// GET ALL USER WORKSPACES
export const getMyWorkspaces = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;

    let workspaces = await Workspace.find({
      $or: [{ owner: userId }, { "members.user": userId }],
    }).populate("members.user", "name email avatar");

    // Auto-create default workspace for new users
    if (workspaces.length === 0) {
      const defaultWs = await Workspace.create({
        name: "My Workspace",
        owner: userId,
        members: [{ user: userId, role: "admin" }],
        isDefault: true,
      });

      await Board.create({
        title: "Sprint 1",
        workspaceId: defaultWs._id,
        createdBy: userId,
      });

      const populatedDefaultWs = await Workspace.findById(
        defaultWs._id,
      ).populate("members.user", "name email avatar");

      workspaces = [populatedDefaultWs];
    }

    res.status(200).json({ success: true, workspaces });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createWorkspace = async (req, res) => {
  try {
    const { name, description } = req.body;
    const userId = req.user._id || req.user.id;

    if (!name) {
      return res
        .status(400)
        .json({ success: false, message: "Workspace name is required" });
    }

    const workspace = await Workspace.create({
      name,
      description: description || "",
      owner: userId,
      members: [{ user: userId, role: "admin" }],
    });

    const board = await Board.create({
      title: "Main Board",
      workspaceId: workspace._id,
      createdBy: userId,
    });

    const populatedWorkspace = await Workspace.findById(workspace._id).populate(
      "members.user",
      "name email avatar",
    );

    res.status(201).json({
      success: true,
      workspace: populatedWorkspace,
      board,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET BOARDS FOR A WORKSPACE
export const getWorkspaceBoards = async (req, res) => {
  try {
    const { workspaceId } = req.params;

    if (!workspaceId) {
      return res
        .status(400)
        .json({ success: false, message: "Workspace ID is required" });
    }

    const boards = await Board.find({ workspaceId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, boards });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// CREATE A BOARD
export const createBoard = async (req, res) => {
  try {
    const { title, workspaceId } = req.body;
    const userId = req.user._id || req.user.id;

    if (!title || !workspaceId) {
      return res.status(400).json({
        success: false,
        message: "Board title and workspace ID are required",
      });
    }

    const board = await Board.create({
      title,
      workspaceId,
      createdBy: userId,
    });

    await ActivityLog.create({
      workspaceId,
      boardId: board._id,
      performedBy: userId,
      action: `Created board "${title}"`,
      entityType: "Board",
      entityId: board._id,
      details: { boardTitle: title },
    });

    res.status(201).json({ success: true, board });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// SEND WORKSPACE INVITATION (Email Input)
export const sendInvitation = async (req, res) => {
  try {
    const { workspaceId, email, role } = req.body;
    const senderId = req.user._id || req.user.id;

    if (!workspaceId || !email) {
      return res.status(400).json({
        success: false,
        message: "Workspace ID and Email are required",
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res
        .status(404)
        .json({ success: false, message: "Workspace not found" });
    }

    const receiverUser = await User.findOne({ email: cleanEmail });

    if (receiverUser) {
      const isMember = workspace.members.some(
        (m) => m.user.toString() === receiverUser._id.toString(),
      );
      if (isMember) {
        return res.status(400).json({
          success: false,
          message: "User is already a member of this workspace",
        });
      }
    }

    const existingInvite = await Invitation.findOne({
      workspaceId,
      receiverEmail: cleanEmail,
      status: "pending",
    });

    if (existingInvite) {
      return res.status(400).json({
        success: false,
        message: "An invitation is already pending for this email",
      });
    }

    const invitation = await Invitation.create({
      workspaceId,
      senderId,
      receiverEmail: cleanEmail,
      role: role || "member",
      status: "pending",
    });

    const populatedInvite = await Invitation.findById(invitation._id)
      .populate("senderId", "name email avatar")
      .populate("workspaceId", "name description");

    if (receiverUser) {
      emitSocketToUser(receiverUser._id, "NEW_INVITATION", populatedInvite);
    }

    res.status(201).json({
      success: true,
      message: `Invitation sent successfully to ${cleanEmail}`,
      invitation: populatedInvite,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET PENDING INVITATIONS FOR LOGGED IN USER
export const getPendingInvitations = async (req, res) => {
  try {
    const userEmail = req.user.email;

    const invitations = await Invitation.find({
      receiverEmail: userEmail,
      status: "pending",
    })
      .populate("senderId", "name email avatar")
      .populate("workspaceId", "name description owner");

    res.status(200).json({ success: true, invitations });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// RESPOND TO INVITATION (Tick = Accept / Cross = Reject)
export const respondToInvitation = async (req, res) => {
  try {
    const { invitationId } = req.params;
    const { action } = req.body; // "accept" or "reject"
    const userId = req.user._id || req.user.id;
    const userEmail = req.user.email;

    if (!["accept", "reject"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Invalid action. Use 'accept' or 'reject'",
      });
    }

    const invitation = await Invitation.findById(invitationId);
    if (!invitation) {
      return res
        .status(404)
        .json({ success: false, message: "Invitation not found" });
    }

    if (invitation.receiverEmail !== userEmail) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to respond to this invitation",
      });
    }

    if (invitation.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Invitation already ${invitation.status}`,
      });
    }

    if (action === "accept") {
      invitation.status = "accepted";
      await invitation.save();

      const workspace = await Workspace.findById(invitation.workspaceId);
      if (workspace) {
        const isAlreadyMember = workspace.members.some(
          (m) => m.user.toString() === userId.toString(),
        );

        if (!isAlreadyMember) {
          workspace.members.push({ user: userId, role: invitation.role });
          await workspace.save();
        }
      }

      await User.findByIdAndUpdate(userId, {
        activeWorkspace: invitation.workspaceId,
      });

      // Create Activity Log
      await ActivityLog.create({
        workspaceId: invitation.workspaceId,
        performedBy: userId,
        action: `${req.user.name} joined the workspace`,
        entityType: "Invitation",
        entityId: invitation._id,
      });

      const updatedWorkspace = await Workspace.findById(
        invitation.workspaceId,
      ).populate("members.user", "name email avatar");

      return res.status(200).json({
        success: true,
        message: "Invitation accepted successfully!",
        workspace: updatedWorkspace,
      });
    } else {
      invitation.status = "rejected";
      await invitation.save();

      return res.status(200).json({
        success: true,
        message: "Invitation rejected",
        invitationId,
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// SWITCH ACTIVE WORKSPACE (Dropdown Selection)
export const switchWorkspace = async (req, res) => {
  try {
    const { workspaceId } = req.body;
    const userId = req.user._id || req.user.id;

    if (!workspaceId) {
      return res
        .status(400)
        .json({ success: false, message: "Workspace ID is required" });
    }

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res
        .status(404)
        .json({ success: false, message: "Workspace not found" });
    }

    const isMember =
      workspace.owner.toString() === userId.toString() ||
      workspace.members.some((m) => m.user.toString() === userId.toString());

    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this workspace",
      });
    }

    await User.findByIdAndUpdate(userId, { activeWorkspace: workspaceId });

    res.status(200).json({
      success: true,
      message: "Switched active workspace successfully",
      activeWorkspaceId: workspaceId,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateWorkspace = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { name, description } = req.body;
    const userId = req.user._id || req.user.id;

    if (!name || !name.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Workspace name is required" });
    }

    const workspace = await Workspace.findById(workspaceId);

    if (!workspace) {
      return res
        .status(404)
        .json({ success: false, message: "Workspace not found" });
    }

    const isOwner = workspace.owner.toString() === userId.toString();
    const memberRecord = workspace.members.find(
      (m) => m.user.toString() === userId.toString(),
    );
    const isAdmin = memberRecord && memberRecord.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to edit this workspace",
      });
    }

    workspace.name = name.trim();
    if (description !== undefined) {
      workspace.description = description.trim();
    }

    await workspace.save();

    const updatedWorkspace = await Workspace.findById(workspaceId).populate(
      "members.user",
      "name email avatar",
    );

    res.status(200).json({
      success: true,
      message: "Workspace updated successfully",
      workspace: updatedWorkspace,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
