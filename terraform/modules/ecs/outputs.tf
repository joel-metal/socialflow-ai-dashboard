output "alb_dns_name" { value = aws_lb.main.dns_name }
output "app_sg_id"    { value = aws_security_group.app.id }
output "cluster_name" { value = aws_ecs_cluster.main.name }
