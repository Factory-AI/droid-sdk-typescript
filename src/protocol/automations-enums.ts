/** Named schedule cadences */
export enum AutomationScheduleCadence {
  Daily = 'daily',
  Weekly = 'weekly',
  Monthly = 'monthly',
}

/** Types of validation issues */
export enum AutomationValidationIssueType {
  MissingFile = 'missing_file',
  InvalidFrontmatter = 'invalid_frontmatter',
  InvalidSchedule = 'invalid_schedule',
  ParseError = 'parse_error',
}

// =============================================================================
// Control-plane enums
// =============================================================================

/**
 * Control-plane error codes.
 *
 * These codes enable deterministic error handling across CLI/desktop surfaces.
 */
export enum AutomationErrorCode {
  /** Automation with the given ID was not found */
  NotFound = 'AUTOMATION_NOT_FOUND',
  /** Automation already exists with the given ID */
  AlreadyExists = 'AUTOMATION_ALREADY_EXISTS',
  /** Invalid automation ID format */
  InvalidId = 'INVALID_AUTOMATION_ID',
  /** Invalid configuration (e.g., invalid schedule) */
  InvalidConfig = 'INVALID_AUTOMATION_CONFIG',
  /** Automation is already in the requested state */
  AlreadyInState = 'ALREADY_IN_STATE',
  /** A run is already in progress for this automation */
  RunInProgress = 'RUN_IN_PROGRESS',
  /** Heartbeat execution failed */
  ExecutionFailed = 'EXECUTION_FAILED',
  /** General internal error */
  InternalError = 'INTERNAL_ERROR',
}

/** Privacy level for an automation */
export enum AutomationPrivacyLevel {
  /** Only visible to the creator */
  Private = 'private',
  /** Visible to all members of the organization */
  Organization = 'organization',
}
