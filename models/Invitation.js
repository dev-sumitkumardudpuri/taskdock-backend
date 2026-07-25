import mongoose from "mongoose";

const invitationSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiverEmail: {
      type: String,
      required: [true, "Receiver email is required"],
      lowercase: true,
      trim: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["admin", "member", "viewer"],
      default: "member",
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true },
);

invitationSchema.index(
  { workspaceId: 1, receiverEmail: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);

export default mongoose.model("Invitation", invitationSchema);
