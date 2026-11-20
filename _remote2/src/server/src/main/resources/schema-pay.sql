-- 支付订单：先建单，支付回调后再入账（幂等）
create table if not exists sy_order (
  id           varchar(40) primary key,       -- 商户订单号
  user_id      varchar(32) not null,
  amount_cents bigint not null,
  status       varchar(16) not null default 'CREATED',  -- CREATED / PAID / CLOSED
  channel      varchar(16) not null default 'MOCK',     -- MOCK / WECHAT / ALIPAY
  trade_no     varchar(64),                   -- 渠道流水号
  paid_at      timestamp,
  created_at   timestamp default current_timestamp
);
create index if not exists ix_order_user on sy_order(user_id, id desc);
create index if not exists ix_order_status on sy_order(status);
