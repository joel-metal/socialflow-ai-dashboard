variable "env"              { type = string }
variable "vpc_id"           { type = string }
variable "public_subnet_ids"  { type = list(string) }
variable "private_subnet_ids" { type = list(string) }
variable "image_uri"        { type = string }
variable "cpu"              { type = number; default = 256 }
variable "memory"           { type = number; default = 512 }
variable "desired_count"    { type = number; default = 1 }
variable "container_port"   { type = number; default = 3001 }
variable "database_url"     { type = string; sensitive = true }
variable "redis_url"        { type = string; sensitive = true }
variable "jwt_secret"       { type = string; sensitive = true }
variable "s3_bucket"        { type = string }
variable "aws_region"       { type = string }
