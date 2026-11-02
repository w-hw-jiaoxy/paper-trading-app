# 夜班排障王 v3 · 塔防版(微信小游戏 + 网页共用代码)

按 HCIE 大纲闯关的塔防:侵略小人沿线路扑向核心服务器,5 台网络设备是防御塔
自动开火;塔会随机出故障(就是大纲知识点),点塔诊断处置,修好才重新开火。
过一章点亮一个成就,进度自动存档。

网页试玩:https://w-hw-jiaoxy.github.io/paper-trading-app/night-shift-troubleshooter/

## 玩法
- 章节:①二层园区(STP/VLAN/ARP) ②接入与DHCP ③OSPF ④BGP ⑤出口防线(NAT/ACL/MTU)
  ⑥物理光层 ⑦综合故障夜 ⑧终章 HCIE 大考(Boss:故障风暴源)
- 敌人:捣乱小人(普通)/疾跑小人(快)/铁皮小人(厚)/Boss;漏进服务器扣血,血量 20
- 点故障塔→诊断面板(全场冻结,安心读题);选对 +15 币恢复开火,选错保持故障可重试
- 点正常塔→升级面板:40/80 币升 Lv2/Lv3,伤害与射速提升
- 过关按剩余血量给 1-3 星,解锁下一章并点亮成就(存档键 nsw3_save)

## 文件
- game.js / game.json:小游戏入口与配置
- js/main.js:游戏本体(菜单/选关/章节介绍/塔防战斗/结算复盘)
- js/faults.js:故障库 20 种,按章节 ch 字段打标;opts[0] 为正确处置(运行时洗牌)
- index.html:网页共用入口
- project.config.json:开发者工具工程配置(appid 占位 touristappid)

## 做成微信体验版(需要一台电脑)
1. mp.weixin.qq.com 注册小游戏账号(个人主体,类目:游戏-休闲游戏),拿到 AppID
2. 把 project.config.json 里的 touristappid 换成你的 AppID
3. 微信开发者工具导入本目录 → 预览没问题 → 上传 → 后台设为体验版
4. 正式发布另需:小程序备案 + 自审自查报告,IAA 广告类约 13-37 个工作日
