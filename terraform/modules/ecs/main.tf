data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task_execution" {
  name               = "socialflow-${var.env}-ecs-exec"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "task" {
  name               = "socialflow-${var.env}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy" "task_s3" {
  name = "s3-access"
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
      Resource = ["arn:aws:s3:::${var.s3_bucket}", "arn:aws:s3:::${var.s3_bucket}/*"]
    }]
  })
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/socialflow-${var.env}"
  retention_in_days = var.env == "prod" ? 30 : 7
}

resource "aws_ecs_cluster" "main" {
  name = "socialflow-${var.env}"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_task_definition" "app" {
  family                   = "socialflow-${var.env}-app"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name        = "app"
    image       = var.image_uri
    stopTimeout = 60
    portMappings = [{ containerPort = var.container_port, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV",    value = var.env },
      { name = "PORT",        value = tostring(var.container_port) },
      { name = "S3_BUCKET",   value = var.s3_bucket },
      { name = "AWS_REGION",  value = var.aws_region }
    ]
    secrets = [
      { name = "DATABASE_URL", valueFrom = aws_ssm_parameter.database_url.arn },
      { name = "REDIS_URL",    valueFrom = aws_ssm_parameter.redis_url.arn },
      { name = "JWT_SECRET",   valueFrom = aws_ssm_parameter.jwt_secret.arn }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "app"
      }
    }
    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:${var.container_port}/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])
}

resource "aws_ssm_parameter" "database_url" {
  name  = "/socialflow/${var.env}/DATABASE_URL"
  type  = "SecureString"
  value = var.database_url
}

resource "aws_ssm_parameter" "redis_url" {
  name  = "/socialflow/${var.env}/REDIS_URL"
  type  = "SecureString"
  value = var.redis_url
}

resource "aws_ssm_parameter" "jwt_secret" {
  name  = "/socialflow/${var.env}/JWT_SECRET"
  type  = "SecureString"
  value = var.jwt_secret
}

resource "aws_security_group" "alb" {
  name   = "socialflow-${var.env}-alb-sg"
  vpc_id = var.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "socialflow-${var.env}-alb-sg" }
}

resource "aws_security_group" "app" {
  name   = "socialflow-${var.env}-app-sg"
  vpc_id = var.vpc_id

  ingress {
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "socialflow-${var.env}-app-sg" }
}

resource "aws_lb" "main" {
  name               = "socialflow-${var.env}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids
  tags               = { Env = var.env }
}

resource "aws_lb_target_group" "app" {
  name        = "socialflow-${var.env}-tg"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

resource "aws_ecs_service" "app" {
  name            = "socialflow-${var.env}-app"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [aws_security_group.app.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "app"
    container_port   = var.container_port
  }

  depends_on = [aws_lb_listener.http]
}
