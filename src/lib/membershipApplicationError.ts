interface ApplicationError {
  code?: string;
  message?: string;
  details?: string | null;
}

export function membershipApplicationConflictMessage(error: ApplicationError) {
  if (error.code !== "23505") return null;

  const conflict = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  if (
    conflict.includes("membership_applications_one_pending") ||
    conflict.includes("membership application is already pending")
  ) {
    return "Your membership application is already under review.";
  }
  if (conflict.includes("profiles_handle_lower_key")) {
    return "That profile handle is already in use.";
  }
  return "Your application conflicts with an existing record. Reload the page and try again.";
}
