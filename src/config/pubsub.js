import { PubSub } from "@google-cloud/pubsub";

// Project comes from GCP_PROJECT_ID, or is auto-detected on Cloud Run.
// No hardcoded fallback: a wrong default silently talks to another
// environment's topics (e.g. production publishing into development).
const pubsub = new PubSub(
  process.env.GCP_PROJECT_ID ? { projectId: process.env.GCP_PROJECT_ID } : {},
);

export default pubsub;
