import { PubSub } from "@google-cloud/pubsub";

const pubsub = new PubSub({
  projectId: process.env.GCP_PROJECT_ID || "lessggo-backend",
});

export default pubsub;