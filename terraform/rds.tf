resource "aws_db_parameter_group" "billing" {
  # name_prefix, not name: family and description are immutable, and a fixed
  # name collides with the group still attached to the running instance.
  name_prefix = "${local.db_identifier}-"
  family      = "postgres16"

  description = "PostgreSQL parameters for the billing database"

  # Queries over 1s go to the log.
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_instance" "billing" {
  identifier = local.db_identifier

  engine         = "postgres"
  engine_version = "16"
  instance_class = "db.t3.micro"

  allocated_storage = 20
  storage_encrypted = true

  db_name  = "billing"
  username = var.db_username
  password = random_password.db_password.result

  db_subnet_group_name   = aws_db_subnet_group.billing.name
  vpc_security_group_ids = [aws_security_group.billing_db.id]
  parameter_group_name   = aws_db_parameter_group.billing.name

  # No public address: access comes from inside the VPC, via the security group.
  publicly_accessible = false

  # Settings for an ephemeral environment, where destroy has to be clean and
  # fast. A real environment would take a final snapshot, turn deletion
  # protection on and keep backups for several days.
  skip_final_snapshot     = true
  deletion_protection     = false
  backup_retention_period = 0

  apply_immediately = true
}
