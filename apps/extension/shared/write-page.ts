/** 兼容旧版撰写页及新版按节点创建主题的页面。 */
export function getWritePageMatches(hosts: readonly string[]): string[] {
  return hosts.flatMap((host) => ['write', 'new'].flatMap((path) => [
    `https://${host}/${path}`,
    `https://${host}/${path}?*`,
    `https://${host}/${path}/*`,
  ]))
}
