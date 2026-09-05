// ─── Display name — fullName, phir username, warna generic fallback
export const getDisplayName = (user) =>
  user?.fullName || user?.username || "Lessggo user";