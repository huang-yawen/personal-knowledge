import { ArrowUpRight, BookOpen, Bot, ChevronRight, Clock3, FileText, FolderPlus, MessageSquareText, Upload } from "lucide-react";
import { metrics, activities } from "@/mock/data";

export function Dashboard() {
  return (
    <div className="dashboard">
      <section className="welcome-section">
        <div>
          <p className="greeting">早上好，Lenovo</p>
          <p className="welcome-copy">让每一次阅读，成为可检索的长期记忆。</p>
        </div>
        <button className="subtle-button" type="button"><Clock3 size={17} /> 查看学习记录</button>
      </section>

      <section className="metric-grid" aria-label="知识概览">
        {metrics.map(({ label, value, detail, icon: Icon, color }) => (
          <article className="metric-card" key={label}>
            <div className={`metric-icon ${color}`}><Icon size={19} strokeWidth={1.8} /></div>
            <div className="metric-main"><span>{label}</span><strong>{value}</strong></div>
            <p>{detail}</p>
          </article>
        ))}
      </section>

      <section className="content-grid primary-grid">
        <article className="panel continue-panel">
          <div className="panel-heading"><div><p className="section-kicker">继续进行</p><h2>回到你的工作流</h2></div><button className="text-button" type="button">查看全部 <ArrowUpRight size={15} /></button></div>
          <div className="continue-list">
            <button className="continue-item" type="button"><span className="document-icon purple"><FileText size={18} /></span><span className="continue-copy"><strong>RAG 检索优化</strong><small>我的笔记 · 12 分钟前编辑</small></span><ChevronRight size={18} /></button>
            <button className="continue-item" type="button"><span className="document-icon blue"><MessageSquareText size={18} /></span><span className="continue-copy"><strong>Transformer 的注意力机制</strong><small>AI 对话 · 昨天</small></span><ChevronRight size={18} /></button>
            <button className="continue-item" type="button"><span className="document-icon orange"><BookOpen size={18} /></span><span className="continue-copy"><strong>Deep Learning Notes</strong><small>机器学习 · 37 个文档</small></span><ChevronRight size={18} /></button>
          </div>
        </article>

        <article className="panel quick-panel">
          <div className="panel-heading"><div><p className="section-kicker">快捷开始</p><h2>创造新的连接</h2></div></div>
          <div className="quick-grid">
            <button className="quick-action" type="button"><span className="quick-icon"><Upload size={19} /></span><span>上传资料</span></button>
            <button className="quick-action" type="button"><span className="quick-icon"><FileText size={19} /></span><span>新建笔记</span></button>
            <button className="quick-action" type="button"><span className="quick-icon"><Bot size={19} /></span><span>开始对话</span></button>
            <button className="quick-action" type="button"><span className="quick-icon"><FolderPlus size={19} /></span><span>创建知识库</span></button>
          </div>
        </article>
      </section>

      <section className="content-grid secondary-grid">
        <article className="panel activity-panel">
          <div className="panel-heading"><div><p className="section-kicker">学习动态</p><h2>本周保持了节奏</h2></div><span className="trend">+24% <small>较上周</small></span></div>
          <div className="chart" aria-label="过去七天学习活动图表">
            {[38, 54, 32, 72, 58, 91, 66].map((height, index) => <span key={height} className={index === 5 ? "active-bar" : ""} style={{ height: `${height}%` }} />)}
          </div>
          <div className="chart-labels"><span>周一</span><span>周二</span><span>周三</span><span>周四</span><span>周五</span><span>周六</span><span>今天</span></div>
          <div className="activity-list">
            {activities.map(({ icon: Icon, color, title, detail }) => <div className="activity-item" key={title}><span className={`activity-icon ${color}`}><Icon size={15} /></span><p><strong>{title}</strong><small>{detail}</small></p></div>)}
          </div>
        </article>
      </section>
    </div>
  );
}
