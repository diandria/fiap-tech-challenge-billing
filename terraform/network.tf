# The default VPC of the Learner Lab, the same one the OS database and the
# cluster use. Nothing here reads another repository's state: the billing
# database can be created and destroyed on its own.
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

locals {
  # With no explicit value the allowed source is the VPC itself, which covers
  # the cluster nodes without referencing their security group.
  ingress_cidr_blocks = coalesce(var.allowed_cidr_blocks, [data.aws_vpc.default.cidr_block])
}

# RDS requires a subnet group spanning at least two AZs, even without Multi-AZ.
resource "aws_db_subnet_group" "billing" {
  name       = local.db_identifier
  subnet_ids = data.aws_subnets.default.ids

  description = "Default VPC subnets used by the billing RDS"
}

resource "aws_security_group" "billing_db" {
  # name_prefix and create_before_destroy: description is immutable and forces
  # replacement, and the Learner Lab denies detaching the RDS ENI by force, so
  # the new group has to exist before the old one goes.
  name_prefix = "${local.db_identifier}-"
  description = "Access to the billing PostgreSQL, restricted to internal sources"
  vpc_id      = data.aws_vpc.default.id

  lifecycle {
    create_before_destroy = true
  }

  ingress {
    description = "PostgreSQL from the internal network"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = local.ingress_cidr_blocks
  }

  # Unrestricted egress is harmless here: RDS does not open outbound
  # connections. Restricting it adds no security and breaks internal DNS.
  #trivy:ignore:AVD-AWS-0104
  egress {
    description = "Unrestricted egress; RDS does not open connections"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
