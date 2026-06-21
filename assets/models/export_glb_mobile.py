import bpy
import os
import numpy as np

# ============================================================
# export_glb_mobile.py — Mobile-Optimized PCB GLB Export
# ============================================================
# Based on export_glb.py, with the following mobile optimizations:
# 1. Texture resolution halved (2048→1024 or 1024→512)
# 2. Draco mesh compression enabled
# 3. Decimate modifier applied to reduce polygon count (~50%)
# 4. Output: armi-pcb-mobile.glb
#
# Usage (in Blender):
#   blender armi-pcb.blend --background --python export_glb_mobile.py
# ============================================================

output_path = os.path.join(os.path.dirname(bpy.data.filepath), "armi-pcb-mobile.glb")
base_dir = os.path.dirname(bpy.data.filepath)

# Mobile texture scale factor (0.5 = half resolution)
MOBILE_TEX_SCALE = 0.5
# Decimate ratio (0.5 = keep 50% of faces)
DECIMATE_RATIO = 0.5

print("=" * 60)
print("PCB Mobile-Optimized Export")
print(f"  Texture scale: {MOBILE_TEX_SCALE}x")
print(f"  Decimate ratio: {DECIMATE_RATIO}")
print(f"  Draco compression: ON")
print("=" * 60)

# ============================================================
# STEP 1: Convert simple Mat4cad materials to Principled BSDF
# ============================================================
# (Identical to export_glb.py — materials must be converted first)
print("\n[Step 1] Converting simple Mat4cad materials...")

converted = 0
for mat in bpy.data.materials:
    if mat is None or not mat.node_tree:
        continue
    
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    
    has_images = any(n.type == 'TEX_IMAGE' for n in nodes)
    if has_images:
        continue
    
    custom_node = None
    output_node = None
    for node in nodes:
        if node.type == 'CUSTOM':
            custom_node = node
        elif node.type == 'OUTPUT_MATERIAL':
            output_node = node
    
    if not custom_node or not output_node:
        continue
    
    base_color = [0.5, 0.5, 0.5, 1.0]
    metallic = 0.0
    roughness = 0.5
    
    for inp in custom_node.inputs:
        name_lower = inp.name.lower()
        if 'color' in name_lower or 'base' in name_lower:
            try:
                val = list(inp.default_value)
                if len(val) >= 3:
                    base_color = val[:3] + [1.0]
            except:
                pass
        elif 'metallic' in name_lower:
            try: metallic = inp.default_value
            except: pass
        elif 'roughness' in name_lower:
            try: roughness = inp.default_value
            except: pass
    
    mat_name = mat.name.upper()
    avg_brightness = sum(base_color[:3]) / 3.0
    
    if any(k in mat_name for k in ['PIN', 'MET-', 'SOLDER', 'SHAPE_1.001', 'SHAPE_15', 'SHAPE_36', 'SHAPE_81', 'SHAPE_61', 'SHAPE_147']):
        metallic = 0.8
        roughness = 0.2
    elif mat_name.startswith('SHAPE_') and avg_brightness > 0.5:
        metallic = 0.8
        roughness = 0.2
    elif mat_name.startswith('SHAPE_') and avg_brightness < 0.3:
        base_color = [0.025, 0.024, 0.025, 1.0]
        metallic = 0.0
        roughness = 0.6
    elif 'RES' in mat_name:
        base_color = [0.02, 0.02, 0.02, 1.0]
        metallic = 0.0
        roughness = 0.85
    elif 'IC-BODY' in mat_name:
        metallic = 0.0
        roughness = 0.6
    elif 'IC-LABEL' in mat_name:
        metallic = 0.0
        roughness = 0.5
    elif 'PLASTIC' in mat_name:
        metallic = 0.0
        roughness = 0.6
    
    mat_exact = mat.name
    if mat_exact == 'PIN-02' or mat_exact == 'SHAPE_1.001':
        base_color = [0.85, 0.72, 0.35, 1.0]
        metallic = 0.8
        roughness = 0.2
    elif mat_exact == 'PIN-01':
        base_color = [0.90, 0.90, 0.87, 1.0]
        metallic = 0.8
        roughness = 0.15
    elif mat_exact == 'Solder Joint':
        base_color = [0.78, 0.78, 0.72, 1.0]
        metallic = 0.8
        roughness = 0.2
    
    nodes.remove(custom_node)
    
    principled = nodes.new('ShaderNodeBsdfPrincipled')
    principled.location = (0, 0)
    principled.inputs['Base Color'].default_value = base_color
    principled.inputs['Metallic'].default_value = metallic
    principled.inputs['Roughness'].default_value = roughness
    
    for link in list(links):
        if link.to_node == output_node:
            links.remove(link)
    
    links.new(principled.outputs['BSDF'], output_node.inputs['Surface'])
    converted += 1

print(f"  Converted {converted} simple materials")

# ============================================================
# STEP 2: Create MOBILE-SIZED composited textures (halved)
# ============================================================
print(f"\n[Step 2] Compositing front & back PCB textures (mobile: {MOBILE_TEX_SCALE}x)...")

cu_img = bpy.data.images.get('260513_pcb2blender_Cu.png')
mask_img = bpy.data.images.get('260513_pcb2blender_Mask.png')
silk_img = bpy.data.images.get('260513_pcb2blender_SilkS.png')

def composite_pcb_face(cu_data, mask_data, silk_data, w, h, channel_idx, face_name):
    """Composite a single PCB face (front or back) from layer channels."""
    cu_ch = cu_data[:, :, channel_idx]
    mask_ch = mask_data[:, :, channel_idx]
    silk_ch = silk_data[:, :, channel_idx] if silk_data is not None else np.zeros((h, w))
    
    pcb_green = np.array([0.0, 0.45, 0.20])
    pcb_green_trace = np.array([0.02, 0.32, 0.16])
    copper_color = np.array([0.72, 0.45, 0.20])
    hasl_color = np.array([0.78, 0.78, 0.72])
    silk_color = np.array([1.0, 1.0, 1.0])
    substrate_color = np.array([0.60, 0.55, 0.35])
    
    result = np.zeros((h, w, 4), dtype=np.float32)
    result[:, :, 3] = 1.0
    
    for c in range(3):
        result[:, :, c] = substrate_color[c]
    
    mask_present = mask_ch > 0.5
    cu_present = cu_ch > 0.5
    mask_only = mask_present & (~cu_present)
    for c in range(3):
        result[:, :, c] = np.where(mask_only, pcb_green[c], result[:, :, c])
    
    cu_under_mask = mask_present & cu_present
    for c in range(3):
        result[:, :, c] = np.where(cu_under_mask, pcb_green_trace[c], result[:, :, c])
    
    exposed_pads = (~mask_present) & cu_present
    for c in range(3):
        result[:, :, c] = np.where(exposed_pads, hasl_color[c], result[:, :, c])
    
    silk_present = silk_ch > 0.5
    for c in range(3):
        result[:, :, c] = np.where(silk_present, silk_color[c], result[:, :, c])
    
    print(f"  {face_name}: mask={np.sum(mask_present)}, cu={np.sum(cu_present)}, trace_under_mask={np.sum(cu_under_mask)}, silk={np.sum(silk_present)} pixels")
    return result

def downsample_image(pixels, src_w, src_h, scale):
    """Simple area-average downsampling."""
    dst_w = max(1, int(src_w * scale))
    dst_h = max(1, int(src_h * scale))
    
    # Reshape to blocks and average
    block_h = src_h // dst_h
    block_w = src_w // dst_w
    
    # Trim to exact multiple
    trimmed = pixels[:dst_h * block_h, :dst_w * block_w, :]
    # Reshape and average over blocks
    result = trimmed.reshape(dst_h, block_h, dst_w, block_w, 4).mean(axis=(1, 3))
    
    return result.astype(np.float32), dst_w, dst_h

if cu_img and mask_img:
    w, h = cu_img.size[0], cu_img.size[1]
    print(f"  Original image dimensions: {w}x{h}")
    
    cu_pixels = np.array(cu_img.pixels[:]).reshape(h, w, 4)
    mask_pixels = np.array(mask_img.pixels[:]).reshape(h, w, 4)
    silk_pixels = np.array(silk_img.pixels[:]).reshape(h, w, 4) if silk_img else None
    
    front_result = composite_pcb_face(cu_pixels, mask_pixels, silk_pixels, w, h, 0, "Front")
    back_result = composite_pcb_face(cu_pixels, mask_pixels, silk_pixels, w, h, 1, "Back")
    
    # Downsample for mobile
    front_result, mob_w, mob_h = downsample_image(front_result, w, h, MOBILE_TEX_SCALE)
    back_result, _, _ = downsample_image(back_result, w, h, MOBILE_TEX_SCALE)
    print(f"  Mobile image dimensions: {mob_w}x{mob_h}")
    
    front_img = bpy.data.images.new("pcb_front_mobile", mob_w, mob_h)
    front_img.pixels = front_result.flatten().tolist()
    front_path = os.path.join(base_dir, "pcb_front_mobile.png")
    front_img.filepath_raw = front_path
    front_img.file_format = 'PNG'
    front_img.save()
    print(f"  Saved mobile front texture: {front_path}")
    
    back_img = bpy.data.images.new("pcb_back_mobile", mob_w, mob_h)
    back_img.pixels = back_result.flatten().tolist()
    back_path = os.path.join(base_dir, "pcb_back_mobile.png")
    back_img.filepath_raw = back_path
    back_img.file_format = 'PNG'
    back_img.save()
    print(f"  Saved mobile back texture: {back_path}")
else:
    print("  ERROR: Layer images not found!")
    front_img = None
    back_img = None

# ============================================================
# STEP 3: Split PCB mesh into front/back faces & assign materials
# ============================================================
# (Identical logic to export_glb.py, using mobile textures)
print("\n[Step 3] Splitting PCB mesh into front/back faces...")

pcb_mat = bpy.data.materials.get('PCB_260513_pcb2blender')
pcb_obj = None

if pcb_mat:
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            for slot in obj.material_slots:
                if slot.material == pcb_mat:
                    pcb_obj = obj
                    break
            if pcb_obj:
                break

if pcb_obj and front_img and back_img:
    print(f"  Found PCB object: {pcb_obj.name}")
    
    front_mat = bpy.data.materials.new(name="PCB_Front")
    front_mat.use_nodes = True
    fn = front_mat.node_tree.nodes
    fl = front_mat.node_tree.links
    for node in list(fn):
        fn.remove(node)
    tex_f = fn.new('ShaderNodeTexImage')
    tex_f.image = front_img
    tex_f.location = (-300, 0)
    prin_f = fn.new('ShaderNodeBsdfPrincipled')
    prin_f.location = (0, 0)
    prin_f.inputs['Roughness'].default_value = 0.45
    out_f = fn.new('ShaderNodeOutputMaterial')
    out_f.location = (300, 0)
    fl.new(tex_f.outputs['Color'], prin_f.inputs['Base Color'])
    fl.new(prin_f.outputs['BSDF'], out_f.inputs['Surface'])
    
    back_mat = bpy.data.materials.new(name="PCB_Back")
    back_mat.use_nodes = True
    bn = back_mat.node_tree.nodes
    bl = back_mat.node_tree.links
    for node in list(bn):
        bn.remove(node)
    tex_b = bn.new('ShaderNodeTexImage')
    tex_b.image = back_img
    tex_b.location = (-300, 0)
    prin_b = bn.new('ShaderNodeBsdfPrincipled')
    prin_b.location = (0, 0)
    prin_b.inputs['Roughness'].default_value = 0.45
    out_b = bn.new('ShaderNodeOutputMaterial')
    out_b.location = (300, 0)
    bl.new(tex_b.outputs['Color'], prin_b.inputs['Base Color'])
    bl.new(prin_b.outputs['BSDF'], out_b.inputs['Surface'])
    
    edge_mat = bpy.data.materials.new(name="PCB_Edge")
    edge_mat.use_nodes = True
    en = edge_mat.node_tree.nodes
    el = edge_mat.node_tree.links
    for node in list(en):
        en.remove(node)
    prin_e = en.new('ShaderNodeBsdfPrincipled')
    prin_e.location = (0, 0)
    prin_e.inputs['Base Color'].default_value = [0.60, 0.55, 0.35, 1.0]
    prin_e.inputs['Roughness'].default_value = 0.7
    out_e = en.new('ShaderNodeOutputMaterial')
    out_e.location = (300, 0)
    el.new(prin_e.outputs['BSDF'], out_e.inputs['Surface'])
    
    pcb_slot_idx = -1
    for i, slot in enumerate(pcb_obj.material_slots):
        if slot.material == pcb_mat:
            pcb_slot_idx = i
            break
    
    pcb_obj.data.materials.append(front_mat)
    front_idx = len(pcb_obj.material_slots) - 1
    pcb_obj.data.materials.append(back_mat)
    back_idx = len(pcb_obj.material_slots) - 1
    pcb_obj.data.materials.append(edge_mat)
    edge_idx = len(pcb_obj.material_slots) - 1
    
    import bmesh
    mesh = pcb_obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    
    front_count = back_count = edge_count = 0
    UP_THRESHOLD = 0.7
    DOWN_THRESHOLD = -0.7
    
    for face in bm.faces:
        if face.material_index != pcb_slot_idx:
            continue
        nz = face.normal.z
        if nz > UP_THRESHOLD:
            face.material_index = front_idx
            front_count += 1
        elif nz < DOWN_THRESHOLD:
            face.material_index = back_idx
            back_count += 1
        else:
            face.material_index = edge_idx
            edge_count += 1
    
    bm.to_mesh(mesh)
    bm.free()
    
    print(f"  Front: {front_count}, Back: {back_count}, Edge: {edge_count}")
    print("  Materials assigned!")
else:
    print("  ERROR: PCB object or textures not found!")

# ============================================================
# STEP 4: Apply Decimate modifier to all mesh objects
# ============================================================
print(f"\n[Step 4] Applying Decimate modifier (ratio: {DECIMATE_RATIO})...")

decimated_count = 0
for obj in bpy.data.objects:
    if obj.type != 'MESH':
        continue
    
    # Count original faces
    orig_faces = len(obj.data.polygons)
    if orig_faces < 100:
        # Skip very small objects (tiny components)
        continue
    
    # Add decimate modifier
    mod = obj.modifiers.new(name="MobileDecimate", type='DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = DECIMATE_RATIO
    
    # Apply modifier
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
        new_faces = len(obj.data.polygons)
        print(f"  {obj.name}: {orig_faces} → {new_faces} faces ({new_faces/orig_faces*100:.0f}%)")
        decimated_count += 1
    except Exception as e:
        # Remove modifier if apply fails (e.g., multi-user data)
        obj.modifiers.remove(mod)
        print(f"  {obj.name}: skipped ({e})")

print(f"  Decimated {decimated_count} objects")

# ============================================================
# STEP 5: Export to GLB with Draco compression
# ============================================================
print("\n[Step 5] Exporting mobile GLB with Draco compression...")

bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    export_texcoords=True,
    export_normals=True,
    export_materials='EXPORT',
    export_image_format='AUTO',
    # ── Mobile optimization: Draco compression ──
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,           # Higher = better compression (0-10)
    export_draco_position_quantization=14,            # Default 14 (good quality)
    export_draco_normal_quantization=10,              # Default 10
    export_draco_texcoord_quantization=12,            # Default 12
    use_selection=False,
    export_apply=True,
)

file_size = os.path.getsize(output_path)
print(f"\n[SUCCESS] {output_path}")
print(f"[SIZE] {file_size/1024/1024:.1f} MB")

# Compare with original
original_path = os.path.join(base_dir, "armi-pcb.glb")
if os.path.exists(original_path):
    orig_size = os.path.getsize(original_path)
    reduction = (1 - file_size / orig_size) * 100
    print(f"[ORIGINAL] {orig_size/1024/1024:.1f} MB")
    print(f"[REDUCTION] {reduction:.0f}% smaller")

# Cleanup temporary mobile textures
for f in ['pcb_front_mobile.png', 'pcb_back_mobile.png']:
    p = os.path.join(base_dir, f)
    if os.path.exists(p):
        os.remove(p)

print("\n[DONE] Mobile GLB export complete!")
