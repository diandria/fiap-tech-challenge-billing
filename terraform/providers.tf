provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "car-repair-shop"
      Phase       = "4"
      Service     = "billing"
      ManagedBy   = "terraform"
      Repository  = "fiap-tech-challenge-billing"
      Environment = var.environment
    }
  }
}
