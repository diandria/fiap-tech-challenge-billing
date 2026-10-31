# Generated rather than passed in as a variable: nobody needs to type it, and
# whoever needs it reads the parameter with the matching IAM permission.
resource "random_password" "db_password" {
  length  = 24
  special = true

  # A slash breaks DATABASE_URL parsing, and ":" and "@" are URI-significant.
  override_special = "!#%*-_=+?"
}

resource "aws_ssm_parameter" "db_password" {
  name        = "/car-repair-shop/billing/db/password"
  description = "Administrator password for the billing RDS"
  type        = "SecureString"
  value       = random_password.db_password.result
}
