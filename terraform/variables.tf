variable "aws_region" {
  description = "AWS region. The Learner Lab only allows us-east-1."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name, used in tags."
  type        = string
  default     = "production"
}

variable "db_username" {
  description = "PostgreSQL administrator user of the billing database."
  type        = string
  default     = "billing_admin"
}

variable "allowed_cidr_blocks" {
  description = "Sources allowed on port 5432. Empty means the default VPC CIDR."
  type        = list(string)
  default     = null

  validation {
    condition     = var.allowed_cidr_blocks == null || !contains(coalesce(var.allowed_cidr_blocks, []), "0.0.0.0/0")
    error_message = "The database is not exposed to the internet. Restrict the source."
  }
}
