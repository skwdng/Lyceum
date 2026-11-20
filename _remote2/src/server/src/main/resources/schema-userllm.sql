-- 用户自带的模型配置（BYOK）：用自己的 key 跑对局，只收服务费
create table if not exists sy_user_llm (
  user_id    varchar(32) primary key,
  base_url   varchar(200) not null default 'https://api.deepseek.com/v1',
  model      varchar(64)  not null default 'deepseek-chat',
  api_key    varchar(200) not null,
  enabled    boolean not null default true,
  updated_at timestamp default current_timestamp
);
