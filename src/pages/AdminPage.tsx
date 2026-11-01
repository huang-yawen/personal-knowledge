import { useEffect, useState } from "react";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import {
  createInvite,
  deleteInvite,
  listAdminUsers,
  listInvites,
  resetUserPassword,
  type AdminInviteDto,
  type AdminUserDto,
} from "@/lib/api";

const formatDate = (iso: string) => new Date(iso).toLocaleString("zh-CN", { hour12: false });

// 管理员页：邀请码管理、用户与用量总览、重置用户密码。后端每个接口都会再校验管理员身份
export function AdminPage() {
  const [invites, setInvites] = useState<AdminInviteDto[]>([]);
  const [users, setUsers] = useState<AdminUserDto[]>([]);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const report = (reason: unknown) => setMessage({ text: reason instanceof Error ? reason.message : "操作失败", isError: true });

  const refresh = () =>
    Promise.all([listInvites(), listAdminUsers()])
      .then(([inviteList, userList]) => {
        setInvites(inviteList);
        setUsers(userList);
      })
      .catch(report);

  useEffect(() => {
    void refresh();
  }, []);

  const addInvite = async () => {
    try {
      const { code } = await createInvite();
      setMessage({ text: `已生成邀请码：${code}`, isError: false });
      await refresh();
    } catch (reason) {
      report(reason);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(
      () => setMessage({ text: `已复制邀请码 ${code}`, isError: false }),
      () => setMessage({ text: "复制失败，请手动选中复制", isError: true }),
    );
  };

  const removeInvite = async (code: string) => {
    if (!window.confirm(`确定删除邀请码 ${code} 吗？`)) return;
    try {
      await deleteInvite(code);
      await refresh();
    } catch (reason) {
      report(reason);
    }
  };

  const resetPassword = async (user: AdminUserDto) => {
    const password = window.prompt(`为「${user.username}」设置新密码（8 到 128 位）。设置后该用户已有的登录会失效。`);
    if (!password) return;
    try {
      await resetUserPassword(user.id, password);
      setMessage({ text: `已重置「${user.username}」的密码`, isError: false });
    } catch (reason) {
      report(reason);
    }
  };

  return (
    <div className="profile-page">
      <div className="profile-page-head">
        <div>
          <p className="eyebrow">管理</p>
          <h2>管理员</h2>
          <p>管理邀请码，查看用户和用量。</p>
        </div>
      </div>
      {message && <p className={message.isError ? "form-error" : "account-message"} role="status">{message.text}</p>}
      <div className="admin-grid">
        <section className="admin-panel">
          <header className="admin-panel-head">
            <h3>邀请码</h3>
            <button type="button" className="admin-primary" onClick={() => void addInvite()}>生成邀请码</button>
          </header>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>邀请码</th><th>创建时间</th><th>状态</th><th /></tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr key={invite.code}>
                    <td><code>{invite.code}</code></td>
                    <td>{formatDate(invite.createdAt)}</td>
                    <td>{invite.usedBy ? <span className="admin-tag">已被 {invite.usedBy} 使用</span> : <span className="admin-tag unused">未使用</span>}</td>
                    <td>
                      {!invite.usedBy && (
                        <div className="admin-actions">
                          <button type="button" onClick={() => copyCode(invite.code)}><Copy size={13} /> 复制</button>
                          <button type="button" onClick={() => void removeInvite(invite.code)}><Trash2 size={13} /> 删除</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {invites.length === 0 && <tr><td colSpan={4} className="admin-empty">还没有邀请码</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <section className="admin-panel">
          <header className="admin-panel-head">
            <h3>用户</h3>
          </header>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>用户名</th><th>显示名称</th><th>注册时间</th><th>文档</th><th>笔记</th><th>对话</th><th>今日 token</th><th>累计 token</th><th /></tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.username}{user.isAdmin && <span className="admin-tag">管理员</span>}</td>
                    <td>{user.displayName}</td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td>{user.documents}</td>
                    <td>{user.notes}</td>
                    <td>{user.conversations}</td>
                    <td>{user.tokensToday.toLocaleString()}</td>
                    <td>{user.tokensTotal.toLocaleString()}</td>
                    <td>
                      <div className="admin-actions">
                        <button type="button" onClick={() => void resetPassword(user)}><KeyRound size={13} /> 重置密码</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
