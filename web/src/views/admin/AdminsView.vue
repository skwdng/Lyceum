<script setup>
/**
 * 管理员管理（仅 `admin:manage` = 超管）。
 *
 * 能做的事：列表、新建（拿一次性密码）、改角色、停用/启用、重置密码。
 *
 * 两条界面规则（设计方案 §6）：
 * 1. **自己那一行的「停用」和「改角色」置灰**并给 tooltip —— 后端也会拒
 *    （CANNOT_DISABLE_SELF / CANNOT_DEMOTE_SELF），这里只是别让人白点一次；
 * 2. 一次性密码**只弹一次**：弹窗里明确写"关闭后无法再查看"，提供复制按钮。
 */
import { computed, onMounted, ref } from 'vue';
import { adminApi } from '../../api.js';
import { useAdminStore } from '../../stores/admin.js';
import { toast } from '../../utils/toast.js';
import { errText, fmtTime } from './helpers.js';

const admin = useAdminStore();

const ROLES = ['SUPER', 'OPS', 'MOD', 'VIEWER'];
const ROLE_LABEL = { SUPER: '超管', OPS: '运营', MOD: '审核', VIEWER: '只读' };

const items = ref([]);
const loading = ref(true);
const error = ref('');
const busy = ref('');

/** 新建账号弹窗里的表单 */
const account = ref('');
const role = ref('MOD');
const customPwd = ref('');
const creating = ref(false);
const createOpen = ref(false);

/** 角色一句话说明：建号时就知道这个人能干什么（减少建错角色） */
const roleTip = computed(() => ({
  SUPER: '全部权限：管账号、能导出全站数据',
  OPS: '日常处置 + 处理记录撤销 + 报表；不能导出、不能审视频',
  MOD: '内容与视频审核；不能封号、不能撤销处置、不能看报表',
  VIEWER: '只读：所有列表可看，任何写操作都被拒'
}[role.value] || ''));

function openCreate() {
  account.value = '';
  role.value = 'MOD';
  customPwd.value = '';
  createOpen.value = true;
}

function closeCreate() {
  if (creating.value) return;
  createOpen.value = false;
}

/** 一次性密码弹窗：{ account, password, hint, kind } */
const pwdModal = ref(null);

const myId = computed(() => (admin.me && admin.me.id) || 0);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const r = await adminApi.admins();
    items.value = (r && r.items) || [];
  } catch (e) {
    error.value = errText(e);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function create() {
  if (creating.value) return;
  const acc = account.value.trim();
  if (!acc) return toast('请填账号');
  if (!role.value) return toast('请选择角色');
  creating.value = true;
  try {
    const r = await adminApi.createAdmin({
      account: acc,
      role: role.value,
      password: customPwd.value.trim() || null
    });
    pwdModal.value = {
      account: (r.admin && r.admin.account) || acc,
      password: r.password,
      hint: r.hint || '这是唯一一次能看到密码，请立刻线下发给对方',
      kind: 'created'
    };
    createOpen.value = false;        // 建号成功 → 关掉表单弹窗，只留"一次性密码"那一个
    account.value = '';
    customPwd.value = '';
    await load();
  } catch (e) {
    toast(errText(e));
  } finally {
    creating.value = false;
  }
}

async function changeRole(row, next) {
  if (busy.value) return;
  if (row.id === myId.value) return toast('不能修改自己的角色');
  busy.value = 'role' + row.id;
  try {
    await adminApi.changeAdminRole(row.id, next);
    toast('角色已改为 ' + (ROLE_LABEL[next] || next));
    await load();
  } catch (e) {
    toast(errText(e));
    await load();          // 失败时把下拉框恢复成真实值
  } finally {
    busy.value = '';
  }
}

async function toggle(row) {
  if (busy.value) return;
  if (row.id === myId.value) return toast('不能停用自己的账号');
  const next = !row.enabled;
  if (!next && !window.confirm(`停用 ${row.account}？停用后该账号立刻无法登录，但不会被删除。`)) return;
  busy.value = 'st' + row.id;
  try {
    await adminApi.setAdminEnabled(row.id, next);
    toast(next ? '已启用' : '已停用');
    await load();
  } catch (e) {
    toast(errText(e));
  } finally {
    busy.value = '';
  }
}

async function resetPwd(row) {
  if (busy.value) return;
  if (!window.confirm(`重置 ${row.account} 的密码？对方会立刻被踢下线，必须用新密码重新登录并改密。`)) return;
  busy.value = 'rp' + row.id;
  try {
    const r = await adminApi.resetAdminPwd(row.id);
    pwdModal.value = {
      account: (r.admin && r.admin.account) || row.account,
      password: r.password,
      hint: r.hint || '这是唯一一次能看到新密码',
      kind: 'reset'
    };
    await load();
  } catch (e) {
    toast(errText(e));
  } finally {
    busy.value = '';
  }
}

async function copyPwd() {
  if (!pwdModal.value) return;
  try {
    await navigator.clipboard.writeText(pwdModal.value.password);
    toast('已复制');
  } catch (e) {
    // 非 https / 老浏览器没有 clipboard：让用户自己选中复制
    toast('复制失败，请手动选中复制');
  }
}

function closePwdModal() {
  pwdModal.value = null;
}
</script>

<template>
  <div class="panel" data-panel="admins">
    <h2>
      管理员管理
      <span class="spacer"></span>
      <span class="muted" style="font-size: 12.5px">共 {{ items.length }} 个账号</span>
      <button class="btn primary sm" @click="openCreate">＋ 新建账号</button>
    </h2>

    <div v-if="error" class="adm-error">
      <b>加载失败</b><span class="msg">{{ error }}</span>
      <button class="btn sm" @click="load">重试</button>
    </div>
    <div v-else-if="loading" class="muted" style="padding: 18px 0">加载中…</div>

    <div v-else class="tbl-x">
      <table>
        <thead>
          <tr>
            <th style="width: 60px">ID</th>
            <th>账号</th>
            <th style="width: 150px">角色</th>
            <th style="width: 90px">状态</th>
            <th style="width: 140px">最后登录</th>
            <th style="width: 130px">创建人</th>
            <th style="width: 210px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="it in items" :key="it.id">
            <td class="muted">{{ it.id }}</td>
            <td>
              <b>{{ it.account }}</b>
              <span v-if="it.id === myId" class="tag blue" style="margin-left: 6px">我</span>
              <span v-if="it.mustChangePwd" class="tag orange" style="margin-left: 6px">待改密</span>
            </td>
            <td>
              <select class="ad-role" :value="it.role"
                      :disabled="it.id === myId || busy === 'role' + it.id"
                      :title="it.id === myId ? '不能修改自己的角色（防止把自己锁死）' : '改角色后对方下一次请求就生效'"
                      @change="changeRole(it, $event.target.value)">
                <option v-for="r in ROLES" :key="r" :value="r">{{ r }} · {{ ROLE_LABEL[r] }}</option>
              </select>
            </td>
            <td>
              <span v-if="it.enabled" class="tag ok">启用</span>
              <span v-else class="tag red">已停用</span>
            </td>
            <td class="muted">{{ it.lastLoginAt ? fmtTime(it.lastLoginAt) : '从未登录' }}</td>
            <td class="muted">{{ it.createdBy || '（种子）' }}</td>
            <td>
              <span class="ad-ops">
                <button class="btn sm" :disabled="it.id === myId || busy === 'st' + it.id"
                        :title="it.id === myId ? '不能停用自己的账号' : ''" @click="toggle(it)">
                  {{ it.enabled ? '停用' : '启用' }}
                </button>
                <button class="btn sm" :disabled="busy === 'rp' + it.id" @click="resetPwd(it)">重置密码</button>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="muted" style="font-size: 12px; margin-top: 12px">
      账号只能由超管创建，<b>不存在自助注册</b>；不能硬删除（处理记录要对得上人），只能停用。
      系统始终至少保留一个启用的超管。
    </p>

    <!-- 新建账号：独立弹窗（不在列表上方堆表单，避免和表格抢视觉重心） -->
    <div v-if="createOpen" class="mask" @click.self="closeCreate">
      <div class="modal" style="width: 460px" data-panel="create-admin">
        <h3>新建管理员账号</h3>
        <div class="body">
          <label class="ac-lb">账号</label>
          <input v-model="account" class="ac-input" maxlength="64" autofocus
                 placeholder="3-64 位，字母或数字开头，可含 _ . -" @keyup.enter="create" />

          <label class="ac-lb">角色</label>
          <select v-model="role" class="ac-input">
            <option v-for="r in ROLES" :key="r" :value="r">{{ r }} · {{ ROLE_LABEL[r] }}</option>
          </select>
          <div class="ac-tip">{{ roleTip }}</div>

          <label class="ac-lb">初始密码（可空）</label>
          <input v-model="customPwd" type="text" class="ac-input" maxlength="64"
                 placeholder="留空则自动生成一次性密码（推荐）" />

          <p class="muted" style="font-size: 12px; margin: 10px 0 0">
            创建成功后<b>只显示一次</b>密码：请立刻线下发给对方，对方首登必须改密。
          </p>
        </div>
        <div class="foot">
          <button class="btn" :disabled="creating" @click="closeCreate">取消</button>
          <button class="btn primary" :disabled="creating" @click="create">
            {{ creating ? '创建中…' : '创建账号' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 一次性密码：唯一一次可见 -->
    <div v-if="pwdModal" class="mask" @click.self="closePwdModal">
      <div class="modal" style="width: 480px" data-panel="pwd-once">
        <h3>{{ pwdModal.kind === 'created' ? '账号已创建' : '密码已重置' }} · {{ pwdModal.account }}</h3>
        <div class="body">
          <div class="ad-pwd">{{ pwdModal.password }}</div>
          <p class="muted" style="font-size: 12.5px; margin-top: 10px">
            {{ pwdModal.hint }}
          </p>
          <p class="muted" style="font-size: 12px">
            对方首登会被强制改密；关闭这个弹窗后就再也看不到这串密码了（库里只有哈希）。
          </p>
        </div>
        <div class="foot">
          <button class="btn" @click="copyPwd">复制密码</button>
          <button class="btn primary" @click="closePwdModal">我已记下 / 已发给对方</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 表格里的角色下拉 */
.ad-role { padding: 5px 8px; font-size: 12.5px; border: 1px solid #E5E6EB; border-radius: 8px;
  background: #fff; width: auto; }
.ad-ops { display: inline-flex; gap: 6px; }
.ad-pwd { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 20px;
  letter-spacing: 1.5px; background: #F7F8FA; border: 1px dashed #C9CDD4; border-radius: 10px;
  padding: 14px; text-align: center; user-select: all; }

/* 新建账号弹窗表单 */
.ac-lb { display: block; font-size: 12.5px; color: #86909C; margin: 12px 0 6px; }
.ac-lb:first-child { margin-top: 0; }
.ac-input { width: 100%; padding: 9px 11px; border: 1px solid #E5E6EB; border-radius: 9px;
  font-size: 13.5px; background: #fff; }
.ac-tip { font-size: 11.5px; color: #86909C; margin-top: 5px; }
</style>
