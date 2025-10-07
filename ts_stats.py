import os

def count_code_stats(directory='.', extensions=('.ts', '.tsx')):
    """
    深度统计项目中的TS代码（排除node_modules和.d.ts）
    """
    stats = {
        'total_files': 0,
        'total_lines': 0,
        'total_chars': 0,
        'by_directory': {},
        'files': []
    }

    for root, dirs, files in os.walk(directory):
        # 跳过node_modules和隐藏目录
        dirs[:] = [d for d in dirs if not d.startswith('.') and d != 'node_modules']
        
        for file in files:
            if not file.endswith('.d.ts') and file.endswith(extensions):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.readlines()
                        line_count = len(content)
                        char_count = sum(len(line) for line in content)
                        
                        # 更新全局统计
                        stats['total_files'] += 1
                        stats['total_lines'] += line_count
                        stats['total_chars'] += char_count
                        
                        # 按目录统计
                        rel_path = os.path.relpath(root, directory)
                        if rel_path not in stats['by_directory']:
                            stats['by_directory'][rel_path] = {
                                'files': 0, 
                                'lines': 0,
                                'chars': 0
                            }
                        stats['by_directory'][rel_path]['files'] += 1
                        stats['by_directory'][rel_path]['lines'] += line_count
                        stats['by_directory'][rel_path]['chars'] += char_count
                        
                        # 记录文件详情
                        stats['files'].append({
                            'path': filepath,
                            'lines': line_count,
                            'chars': char_count
                        })
                except Exception as e:
                    print(f"跳过 {filepath} （读取错误: {str(e)}）")

    return stats

def print_stats(stats, max_files=20):
    """增强版统计结果输出"""
    # 全局统计
    print(f"\n\033[1mTypeScript 代码深度统计\033[0m (排除 node_modules 和 .d.ts)")
    print(f"📁 总文件数: {stats['total_files']}")
    print(f"📜 总代码行数: {stats['total_lines']}")
    print(f"🔤 总字符数: {stats['total_chars']}")
    
    # 按目录统计
    print("\n\033[1m📂 按目录统计:\033[0m")
    sorted_dirs = sorted(
        stats['by_directory'].items(), 
        key=lambda x: x[1]['lines'], 
        reverse=True
    )
    for dir_path, data in sorted_dirs[:10]:
        print(f"  {dir_path or '<root>'}: {data['lines']}行 ({data['files']}个文件)")
    
    # 大文件详情
    print(f"\n\033[1m🔍 最大 {max_files} 个文件:\033[0m")
    sorted_files = sorted(stats['files'], key=lambda x: x['lines'], reverse=True)
    for i, file in enumerate(sorted_files[:max_files], 1):
        print(f"{i:2d}. {file['path']} - \033[33m{file['lines']}行\033[0m")

if __name__ == "__main__":
    print("正在扫描项目目录...")
    stats = count_code_stats()
    print_stats(stats, max_files=20)
