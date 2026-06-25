# ============================================================
# HealthCareOAB+ — production infrastructure skeleton (AWS)
# Managed services chosen for a HIPAA/ГОСТ-grade healthcare workload:
#   - RDS PostgreSQL (encrypted, multi-AZ, automated backups, PITR)
#   - ElastiCache Redis (encrypted in transit + at rest)
#   - ECR for the API image; deploy target (ECS/EKS) left as a module hook
# This is a starting point — wire remote state, VPC, and IAM per environment.
# ============================================================

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  # backend "s3" { ... }  # configure remote state per environment
}

provider "aws" {
  region = var.region
}

variable "region" {
  type    = string
  default = "eu-central-1"
}

variable "environment" {
  type    = string
  default = "production"
}

variable "vpc_id" {
  type        = string
  description = "Existing VPC to deploy into"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Private subnets for RDS/ElastiCache/app"
}

variable "db_password" {
  type      = string
  sensitive = true
}

locals {
  name = "healthcare-oab-${var.environment}"
  tags = {
    Project     = "healthcare-oab"
    Environment = var.environment
    ManagedBy   = "terraform"
    Compliance  = "phi"
  }
}

# ---------------- Container registry ----------------
resource "aws_ecr_repository" "api" {
  name                 = "${local.name}-api"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "KMS"
  }
  tags = local.tags
}

# ---------------- PostgreSQL (RDS) ----------------
resource "aws_db_subnet_group" "db" {
  name       = "${local.name}-db"
  subnet_ids = var.private_subnet_ids
  tags       = local.tags
}

resource "aws_security_group" "db" {
  name   = "${local.name}-db"
  vpc_id = var.vpc_id
  tags   = local.tags
}

resource "aws_db_instance" "postgres" {
  identifier                   = "${local.name}-pg"
  engine                       = "postgres"
  engine_version               = "16"
  instance_class               = "db.t4g.medium"
  allocated_storage            = 50
  max_allocated_storage        = 500
  storage_encrypted            = true
  db_name                      = "healthcare_oab"
  username                     = "oab"
  password                     = var.db_password
  multi_az                     = true
  backup_retention_period      = 14
  deletion_protection          = true
  performance_insights_enabled = true
  db_subnet_group_name         = aws_db_subnet_group.db.name
  vpc_security_group_ids       = [aws_security_group.db.id]
  skip_final_snapshot          = false
  final_snapshot_identifier    = "${local.name}-pg-final"
  tags                         = local.tags
}

# ---------------- Redis (ElastiCache) ----------------
resource "aws_elasticache_subnet_group" "redis" {
  name       = "${local.name}-redis"
  subnet_ids = var.private_subnet_ids
}

resource "aws_security_group" "redis" {
  name   = "${local.name}-redis"
  vpc_id = var.vpc_id
  tags   = local.tags
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "${local.name}-redis"
  description                = "HealthCareOAB+ session/cache/rate-limit store"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = "cache.t4g.small"
  num_cache_clusters         = 2
  automatic_failover_enabled = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  subnet_group_name          = aws_elasticache_subnet_group.redis.name
  security_group_ids         = [aws_security_group.redis.id]
  tags                       = local.tags
}

# ---------------- Outputs ----------------
output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "database_endpoint" {
  value = aws_db_instance.postgres.endpoint
}

output "redis_primary_endpoint" {
  value = aws_elasticache_replication_group.redis.primary_endpoint_address
}
