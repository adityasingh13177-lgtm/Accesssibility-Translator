// Minimal model. Merge these fields into your existing Document model if you already have one.
import mongoose from "mongoose";
const schema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  title: String, source: String, level: String, language: String,
  sourceText: { type: String, select: false }, // kept for grounded Q&A; never sent to the client list view
  result: mongoose.Schema.Types.Mixed,
  saved: { type: Boolean, default: false },
}, { timestamps: true });
export default mongoose.model("Document", schema);
