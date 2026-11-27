# 思弈阁 · 生产镜像
# 三阶段：node 构建前端 → maven 打包 jar → temurin JRE 运行（非 root）
# 构建：docker build -t siyige-server:$(date +%Y%m%d-%H%M%S) .
# 说明：镜像里**不含** server/config/application.yml（含 key），运行时由 compose 只读挂载。

# ---------- 阶段 1：前端 ----------
FROM node:20-alpine AS web
WORKDIR /build/web

# 先只拷贝清单，命中依赖层缓存
COPY web/package.json web/package-lock.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# 源码 + 构建配置（vite outDir 固定为 ../server/src/main/resources/static/v2）
COPY web/ ./
RUN npm run build \
 && test -f /build/server/src/main/resources/static/v2/index.html \
 && test -d /build/server/src/main/resources/static/v2/assets \
 && echo "web 产物 OK"

# ---------- 阶段 2：后端 ----------
FROM maven:3.9-eclipse-temurin-17 AS backend
WORKDIR /build

# 依赖层：pom 不变就不重复下载
COPY server/pom.xml server/pom.xml
RUN mvn -B -ntp -f server/pom.xml dependency:go-offline || true

COPY server/src server/src
# 用阶段 1 的产物覆盖仓库里的种子产物，保证镜像里的前端就是本次源码构建出来的
COPY --from=web /build/server/src/main/resources/static/v2 server/src/main/resources/static/v2
RUN mvn -B -ntp -f server/pom.xml package -DskipTests \
 && ls -l server/target/*.jar

# ---------- 阶段 3：运行 ----------
FROM eclipse-temurin:17-jre

# curl 用于 HEALTHCHECK（基础镜像不保证带）；tini 不做，JVM 直接接信号
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl tzdata \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 10001 siyige \
 && useradd --system --uid 10001 --gid siyige --home-dir /app --shell /usr/sbin/nologin siyige

WORKDIR /app

COPY --from=backend /build/server/target/siyige-backend-0.1.0.jar /app/app.jar

# data=H2 数据目录（compose 挂载），logs=应用日志，config=运行时只读挂载配置
RUN mkdir -p /app/data /app/logs /app/config \
 && chown -R siyige:siyige /app \
 && chmod 750 /app/data /app/logs

ENV TZ=Asia/Shanghai \
    LANG=C.UTF-8 \
    JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError -Dfile.encoding=UTF-8 -Duser.timezone=Asia/Shanghai"

USER siyige
EXPOSE 8080

# 容器健康 = 应用自身 /api/health 返回 ok:true
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD curl -fsS --max-time 4 http://127.0.0.1:8080/api/health | grep -q '"ok":true' || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
