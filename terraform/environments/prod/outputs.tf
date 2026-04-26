output "app_url"    { value = "http://${module.ecs.alb_dns_name}" }
output "db_endpoint" { value = module.rds.endpoint }
output "redis_host"  { value = module.elasticache.primary_endpoint }
output "s3_bucket"   { value = module.s3.bucket_name }
