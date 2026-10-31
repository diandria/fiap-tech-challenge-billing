output "db_endpoint" {
  description = "RDS DNS address. Resolves to a private VPC address."
  value       = aws_db_instance.billing.address
}

output "db_port" {
  description = "PostgreSQL port."
  value       = aws_db_instance.billing.port
}

output "db_name" {
  description = "Name of the database created on the instance."
  value       = aws_db_instance.billing.db_name
}

output "db_username" {
  description = "Administrator user."
  value       = aws_db_instance.billing.username
  sensitive   = true
}

output "db_password_parameter" {
  description = "Name of the SSM parameter holding the password. Not the password."
  value       = aws_ssm_parameter.db_password.name
}
